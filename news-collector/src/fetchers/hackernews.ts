import type { NewsEntry } from "../index";

const HN_API = "https://hacker-news.firebaseio.com/v0";

interface HNItem {
	id: number;
	title?: string;
	url?: string;
	text?: string;
	time?: number;
	score?: number;
	type?: string;
}

export async function fetchHackerNews(): Promise<NewsEntry[]> {
	// 获取最新 top stories
	const res = await fetch(`${HN_API}/topstories.json`, {
		signal: AbortSignal.timeout(10000),
	});
	const ids: number[] = await res.json();

	// 取前 30 条
	const topIds = ids.slice(0, 30);

	const items = await Promise.allSettled(
		topIds.map(async (id) => {
			const r = await fetch(`${HN_API}/item/${id}.json`, {
				signal: AbortSignal.timeout(5000),
			});
			return (await r.json()) as HNItem;
		})
	);

	const entries: NewsEntry[] = [];

	for (const result of items) {
		if (result.status !== "fulfilled" || !result.value) continue;
		const item = result.value;

		// 跳过没有标题或 URL 的条目
		if (!item.title || !item.url) continue;

		entries.push({
			id: `hn-${item.id}`,
			source: "hackernews",
			sourceUrl: item.url,
			title: item.title,
			summary: item.text?.slice(0, 500) || null,
			publishedAt: item.time
				? new Date(item.time * 1000).toISOString()
				: null,
			relevanceScore: 0, // Will be set by AI
		});
	}

	return entries;
}
