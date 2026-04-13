import type { NewsEntry } from "../index";

interface RSSSource {
	url: string;
	name: string;
}

const RSS_SOURCES: RSSSource[] = [
	{ url: "https://buttondown.com/ainews/rss", name: "ainews" },
	{ url: "https://www.artificialintelligence-news.com/feed/", name: "ai-news" },
	{ url: "https://tldr.tech/ai/rss", name: "tldr-ai" },
	{ url: "https://blog.openai.com/rss/", name: "openai" },
	{ url: "https://www.anthropic.com/feed", name: "anthropic" },
	{ url: "https://blog.google/technology/ai/rss/", name: "google-ai" },
	{ url: "https://techcrunch.com/category/artificial-intelligence/feed/", name: "techcrunch" },
	{ url: "https://www.theverge.com/rss/ai-artificial-intelligence/index.xml", name: "theverge" },
];

export async function fetchRSSFeeds(): Promise<NewsEntry[]> {
	const results = await Promise.allSettled(
		RSS_SOURCES.map((source) => fetchSingleFeed(source))
	);

	const entries: NewsEntry[] = [];
	for (const result of results) {
		if (result.status === "fulfilled") {
			entries.push(...result.value);
		}
	}

	return entries;
}

async function fetchSingleFeed(source: RSSSource): Promise<NewsEntry[]> {
	const res = await fetch(source.url, {
		headers: {
			"User-Agent": "NewsCollector/1.0",
			Accept: "application/rss+xml, application/xml, text/xml",
		},
		signal: AbortSignal.timeout(10000),
	});

	if (!res.ok) {
		console.error(`[RSS] ${source.name} returned ${res.status}`);
		return [];
	}

	const xml = await res.text();
	return parseRSS(xml, source.name);
}

function parseRSS(xml: string, sourceName: string): NewsEntry[] {
	const entries: NewsEntry[] = [];

	// 简易 XML 解析（Worker 环境无 DOMParser 等，用正则提取）
	// 同时匹配 <item> (RSS 2.0) 和 <entry> (Atom)
	const itemRegex = /<(?:item|entry)[\s>]([\s\S]*?)<\/(?:item|entry)>/gi;
	let match: RegExpExecArray | null;
	let count = 0;

	while ((match = itemRegex.exec(xml)) !== null && count < 20) {
		const block = match[1];

		const title = extractTag(block, "title");
		const link =
			extractTag(block, "link") ||
			extractAttr(block, "link", "href");
		const description =
			extractTag(block, "description") ||
			extractTag(block, "summary") ||
			extractTag(block, "content");
		const pubDate =
			extractTag(block, "pubDate") ||
			extractTag(block, "published") ||
			extractTag(block, "updated");

		if (!title || !link) continue;

		const cleanTitle = stripHtml(title).trim();
		const cleanDesc = description ? stripHtml(description).slice(0, 500).trim() : null;

		entries.push({
			id: `rss-${sourceName}-${simpleHash(link)}`,
			source: sourceName,
			sourceUrl: link,
			title: cleanTitle,
			summary: cleanDesc,
			publishedAt: pubDate ? tryParseDate(pubDate) : null,
			relevanceScore: 0,
		});

		count++;
	}

	return entries;
}

function extractTag(block: string, tag: string): string | null {
	// Match <tag>content</tag> or <tag><![CDATA[content]]></tag>
	const regex = new RegExp(
		`<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`,
		"i"
	);
	const m = block.match(regex);
	return m ? m[1].trim() : null;
}

function extractAttr(
	block: string,
	tag: string,
	attr: string
): string | null {
	const regex = new RegExp(
		`<${tag}[^>]*${attr}=["']([^"']+)["']`,
		"i"
	);
	const m = block.match(regex);
	return m ? m[1] : null;
}

function stripHtml(html: string): string {
	return html
		.replace(/<[^>]+>/g, "")
		.replace(/&amp;/g, "&")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&nbsp;/g, " ");
}

function simpleHash(str: string): string {
	let hash = 0;
	for (let i = 0; i < str.length; i++) {
		const char = str.charCodeAt(i);
		hash = ((hash << 5) - hash + char) | 0;
	}
	return Math.abs(hash).toString(36);
}

function tryParseDate(dateStr: string): string | null {
	try {
		const d = new Date(dateStr);
		return isNaN(d.getTime()) ? null : d.toISOString();
	} catch {
		return null;
	}
}
