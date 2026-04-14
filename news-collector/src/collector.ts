import { filterAndTranslate, planCollection } from "./ai";
import type { CollectionPlanStep, NewsEntry } from "./types";

const MAX_PLAN_STEPS = 8;
const DEFAULT_TOOL_LIMIT = 8;
const GOOGLE_NEWS_MAX = 20;
const BING_NEWS_MAX = 20;
const HACKER_NEWS_MAX = 20;

export async function collectAndFilterNews(ai: Ai, keywords: string[]) {
	const normalizedKeywords = keywords.map((item) => item.trim()).filter(Boolean);
	if (normalizedKeywords.length === 0) {
		return {
			items: [] as NewsEntry[],
			rawCount: 0,
			filteredCount: 0,
			toolCalls: 0,
		};
	}

	const plan = await buildCollectionPlan(ai, normalizedKeywords);
	const settled = await Promise.allSettled(plan.map((step) => runPlanStep(step)));
	const collectedItems = settled.flatMap((result) =>
		result.status === "fulfilled" ? result.value : []
	);
	const rawItems = dedupeNewsEntries(collectedItems);
	const filteredItems =
		rawItems.length > 0 ? await filterAndTranslate(ai, rawItems) : [];

	return {
		items: filteredItems,
		rawCount: rawItems.length,
		filteredCount: filteredItems.length,
		toolCalls: plan.length,
	};
}

async function buildCollectionPlan(ai: Ai, keywords: string[]) {
	try {
		const planned = await planCollection(ai, keywords);
		const sanitized = sanitizePlan(planned, keywords);
		if (sanitized.length > 0) {
			return sanitized;
		}
	} catch (error) {
		console.error("[Collector] planner failed, fallback to default plan:", error);
	}

	return buildFallbackPlan(keywords);
}

function sanitizePlan(plan: CollectionPlanStep[], keywords: string[]) {
	const keywordSet = new Set(keywords.map((item) => item.toLowerCase()));
	const dedupe = new Set<string>();
	const sanitized: CollectionPlanStep[] = [];

	for (const step of plan) {
		const label = step.label.trim();
		const query = step.query.trim();
		if (!label || !query || !keywordSet.has(label.toLowerCase())) {
			continue;
		}

		const limit = Math.min(
			DEFAULT_TOOL_LIMIT,
			Math.max(3, Math.round(step.limit ?? DEFAULT_TOOL_LIMIT))
		);
		const dedupeKey = `${step.tool}::${label.toLowerCase()}::${query.toLowerCase()}`;
		if (dedupe.has(dedupeKey)) {
			continue;
		}

		dedupe.add(dedupeKey);
		sanitized.push({
			tool: step.tool,
			query,
			label,
			limit,
		});

		if (sanitized.length >= MAX_PLAN_STEPS) {
			break;
		}
	}

	return sanitized;
}

function buildFallbackPlan(keywords: string[]) {
	const steps: CollectionPlanStep[] = [];
	for (const keyword of keywords) {
		steps.push({
			tool: "google-news",
			query: keyword,
			label: keyword,
			limit: DEFAULT_TOOL_LIMIT,
		});
		steps.push({
			tool: "bing-news",
			query: keyword,
			label: keyword,
			limit: DEFAULT_TOOL_LIMIT,
		});
		if (steps.length >= MAX_PLAN_STEPS) {
			break;
		}
	}
	return steps.slice(0, MAX_PLAN_STEPS);
}

async function runPlanStep(step: CollectionPlanStep): Promise<NewsEntry[]> {
	switch (step.tool) {
		case "google-news":
			return fetchGoogleNewsSearch(step.query, step.label, step.limit ?? DEFAULT_TOOL_LIMIT);
		case "bing-news":
			return fetchBingNewsSearch(step.query, step.label, step.limit ?? DEFAULT_TOOL_LIMIT);
		case "hacker-news":
			return fetchHackerNewsSearch(step.query, step.label, step.limit ?? DEFAULT_TOOL_LIMIT);
	}

	return [];
}

async function fetchGoogleNewsSearch(query: string, label: string, limit: number) {
	const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=zh-CN&gl=CN&ceid=CN:zh-Hans`;
	const xml = await fetchText(url, {
		"User-Agent": "Mozilla/5.0 (compatible; PixelverseNewsCollector/1.0)",
		Accept: "application/rss+xml, application/xml, text/xml, */*",
	});
	return parseRssItems(xml, label, "google-news", Math.min(limit, GOOGLE_NEWS_MAX));
}

async function fetchBingNewsSearch(query: string, label: string, limit: number) {
	const url = `https://www.bing.com/news/search?q=${encodeURIComponent(query)}&format=rss`;
	const xml = await fetchText(url, {
		"User-Agent": "Mozilla/5.0 (compatible; PixelverseNewsCollector/1.0)",
		Accept: "application/rss+xml, application/xml, text/xml, */*",
	});
	return parseRssItems(xml, label, "bing-news", Math.min(limit, BING_NEWS_MAX));
}

type HackerNewsSearchResponse = {
	hits?: Array<{
		objectID?: string;
		title?: string | null;
		url?: string | null;
		story_text?: string | null;
		created_at?: string | null;
	}>;
};

async function fetchHackerNewsSearch(query: string, label: string, limit: number) {
	const url = new URL("https://hn.algolia.com/api/v1/search");
	url.searchParams.set("query", query);
	url.searchParams.set("tags", "story");
	url.searchParams.set("hitsPerPage", String(Math.min(limit, HACKER_NEWS_MAX)));

	const res = await fetch(url.toString(), {
		headers: {
			"User-Agent": "Mozilla/5.0 (compatible; PixelverseNewsCollector/1.0)",
			Accept: "application/json, text/plain, */*",
		},
	});

	if (!res.ok) {
		throw new Error(`Hacker News returned ${res.status}`);
	}

	const data = (await res.json()) as HackerNewsSearchResponse;
	return (data.hits ?? [])
		.map((item) => {
			const title = item.title?.trim();
			if (!title) {
				return null;
			}

			const sourceUrl =
				item.url?.trim() ||
				(item.objectID ? `https://news.ycombinator.com/item?id=${item.objectID}` : "");
			if (!sourceUrl) {
				return null;
			}

			const entry: NewsEntry = {
				id: `hn-${simpleHash(`${sourceUrl}:${label}`)}`,
				source: "hacker-news",
				sourceUrl,
				title,
				summary: item.story_text?.trim() || null,
				content: item.story_text?.trim() || null,
				relevanceScore: 0,
				tags: [],
				publishedAt: tryParseDate(item.created_at ?? null),
				searchKeyword: label,
			};

			return entry;
		})
		.filter((item): item is NewsEntry => item !== null);
}

async function fetchText(url: string, headers: Record<string, string>) {
	const res = await fetch(url, { headers });
	if (!res.ok) {
		throw new Error(`${url} returned ${res.status}`);
	}

	return res.text();
}

function parseRssItems(
	xml: string,
	label: string,
	defaultSource: string,
	limit: number
) {
	const entries: NewsEntry[] = [];
	const itemRegex = /<item[\s>]([\s\S]*?)<\/item>/gi;
	let match: RegExpExecArray | null;

	while ((match = itemRegex.exec(xml)) !== null && entries.length < limit) {
		const block = match[1];
		const title = extractTag(block, "title");
		const link = extractTag(block, "link");
		const description = extractTag(block, "description");
		const pubDate = extractTag(block, "pubDate");
		const source =
			extractTag(block, "source") ?? extractSourceFromUrl(link ?? "") ?? defaultSource;

		if (!title || !link) {
			continue;
		}

		entries.push({
			id: `${defaultSource}-${simpleHash(`${link}:${label}`)}`,
			source,
			sourceUrl: link,
			title: stripHtml(title).trim(),
			summary: description ? stripHtml(description).slice(0, 600).trim() : null,
			content: description ? stripHtml(description).slice(0, 1200).trim() : null,
			relevanceScore: 0,
			tags: [],
			publishedAt: tryParseDate(pubDate),
			searchKeyword: label,
		});
	}

	return entries;
}

function dedupeNewsEntries(items: NewsEntry[]) {
	const seen = new Set<string>();
	const deduped: NewsEntry[] = [];

	for (const item of items) {
		const key = item.sourceUrl || `${item.source}:${item.title}`;
		if (!key || seen.has(key)) {
			continue;
		}

		seen.add(key);
		deduped.push(item);
	}

	return deduped.sort((a, b) => {
		const aTime = a.publishedAt ? Date.parse(a.publishedAt) : 0;
		const bTime = b.publishedAt ? Date.parse(b.publishedAt) : 0;
		return bTime - aTime;
	});
}

function extractTag(block: string, tag: string): string | null {
	const regex = new RegExp(
		`<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`,
		"i"
	);
	const match = block.match(regex);
	return match ? match[1].trim() : null;
}

function extractSourceFromUrl(url: string) {
	try {
		return new URL(url).hostname.replace(/^www\./, "");
	} catch {
		return null;
	}
}

function stripHtml(html: string) {
	return html
		.replace(/&amp;/g, "&")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&nbsp;/g, " ")
		.replace(/&#\d+;/g, " ")
		.replace(/<[^>]+>/g, "")
		.trim();
}

function simpleHash(str: string) {
	let hash = 0;
	for (let i = 0; i < str.length; i++) {
		const char = str.charCodeAt(i);
		hash = ((hash << 5) - hash + char) | 0;
	}
	return Math.abs(hash).toString(36);
}

function tryParseDate(dateStr: string | null) {
	if (!dateStr) {
		return null;
	}

	try {
		const date = new Date(dateStr);
		return Number.isNaN(date.getTime()) ? null : date.toISOString();
	} catch {
		return null;
	}
}
