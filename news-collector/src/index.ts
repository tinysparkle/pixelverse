import { fetchHackerNews } from "./fetchers/hackernews";
import { fetchRSSFeeds } from "./fetchers/rss";
import { filterAndTranslate } from "./ai";

export interface Env {
	DB: D1Database;
	AI: Ai;
	SHARED_SECRET: string;
}

export interface NewsEntry {
	id: string;
	source: string;
	sourceUrl: string;
	title: string;
	titleZh?: string | null;
	summary?: string | null;
	summaryZh?: string | null;
	content?: string | null;
	relevanceScore: number;
	tags?: string[];
	publishedAt?: string | null;
}

export default {
	// Cron Trigger: 每 6 小时自动采集
	async scheduled(_event: ScheduledEvent, env: Env, _ctx: ExecutionContext) {
		await collectNews(env);
	},

	// HTTP API: 供 Pixelverse 拉取数据
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);

		if (url.pathname === "/" || url.pathname === "/health") {
			return Response.json({
				ok: true,
				service: "news-collector",
				endpoints: ["GET /health", "GET /api/news", "POST /api/collect"],
				note: "api endpoints require Authorization: Bearer <SHARED_SECRET>",
			});
		}

		if (url.pathname === "/api/news") {
			// 验证密钥
			const authHeader = request.headers.get("Authorization");
			if (authHeader !== `Bearer ${env.SHARED_SECRET}`) {
				return new Response("Unauthorized", { status: 401 });
			}

			const limit = Math.min(Number(url.searchParams.get("limit")) || 100, 500);
			const since = url.searchParams.get("since") || "";

			let query = "SELECT * FROM news_items";
			const params: string[] = [];

			if (since) {
				query += " WHERE fetched_at > ?1";
				params.push(since);
			}

			query += " ORDER BY published_at DESC, fetched_at DESC LIMIT ?";
			params.push(String(limit));

			const paramIndex = params.length;
			// Rebuild with proper positional params
			let finalQuery = "SELECT * FROM news_items";
			const finalParams: string[] = [];

			if (since) {
				finalQuery += ` WHERE fetched_at > ?`;
				finalParams.push(since);
			}

			finalQuery += ` ORDER BY published_at DESC, fetched_at DESC LIMIT ?`;
			finalParams.push(String(limit));

			const result = await env.DB.prepare(finalQuery)
				.bind(...finalParams)
				.all();

			const items = (result.results || []).map((row: Record<string, unknown>) => ({
				id: row.id,
				source: row.source,
				sourceUrl: row.source_url,
				title: row.title,
				titleZh: row.title_zh,
				summary: row.summary,
				summaryZh: row.summary_zh,
				content: row.content,
				relevanceScore: row.relevance_score,
				tags: typeof row.tags === "string" && row.tags ? row.tags.split(",") : [],
				publishedAt: row.published_at,
			}));

			return Response.json(items);
		}

		// 手动触发采集（调试用）
		if (url.pathname === "/api/collect") {
			const authHeader = request.headers.get("Authorization");
			if (authHeader !== `Bearer ${env.SHARED_SECRET}`) {
				return new Response("Unauthorized", { status: 401 });
			}

			const result = await collectNews(env);
			return Response.json(result);
		}

		return new Response("Not Found", { status: 404 });
	},
};

async function collectNews(env: Env) {
	console.log("[news-collector] Starting collection...");

	// 并行采集所有数据源
	const [hnItems, rssItems] = await Promise.allSettled([
		fetchHackerNews(),
		fetchRSSFeeds(),
	]);

	const rawItems: NewsEntry[] = [];

	if (hnItems.status === "fulfilled") {
		rawItems.push(...hnItems.value);
		console.log(`[HN] Fetched ${hnItems.value.length} items`);
	} else {
		console.error("[HN] Failed:", hnItems.reason);
	}

	if (rssItems.status === "fulfilled") {
		rawItems.push(...rssItems.value);
		console.log(`[RSS] Fetched ${rssItems.value.length} items`);
	} else {
		console.error("[RSS] Failed:", rssItems.reason);
	}

	if (rawItems.length === 0) {
		console.log("[news-collector] No items fetched");
		return { fetched: 0, stored: 0 };
	}

	// Workers AI 过滤 + 翻译
	const filtered = await filterAndTranslate(env.AI, rawItems);
	console.log(`[AI] Filtered: ${filtered.length} / ${rawItems.length}`);

	// 存入 D1
	let stored = 0;
	for (const item of filtered) {
		try {
			await env.DB.prepare(
				`INSERT OR IGNORE INTO news_items (id, source, source_url, title, title_zh, summary, summary_zh, content, relevance_score, tags, published_at)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
			)
				.bind(
					item.id,
					item.source,
					item.sourceUrl,
					item.title,
					item.titleZh || null,
					item.summary || null,
					item.summaryZh || null,
					item.content || null,
					item.relevanceScore,
					item.tags?.join(",") || null,
					item.publishedAt || null
				)
				.run();
			stored++;
		} catch {
			// duplicate, skip
		}
	}

	// 清理 30 天前的数据
	await env.DB.prepare(
		"DELETE FROM news_items WHERE fetched_at < datetime('now', '-30 days')"
	).run();

	console.log(`[news-collector] Done: fetched=${rawItems.length}, stored=${stored}`);
	return { fetched: rawItems.length, stored };
}
