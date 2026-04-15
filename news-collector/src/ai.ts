import type { CollectionPlanStep, NewsEntry } from "./types";

interface AIResult {
	id: string;
	score: number;
	tags: string[];
	title_zh: string;
	summary_zh: string;
}

const BATCH_SIZE = 10;
const MAX_PLAN_STEPS = 8;
const DEFAULT_STEP_LIMIT = 8;

export async function planCollection(
	ai: Ai,
	keywords: string[]
): Promise<CollectionPlanStep[]> {
	const normalizedKeywords = keywords.map((item) => item.trim()).filter(Boolean);
	if (normalizedKeywords.length === 0) {
		return [];
	}

	const response = await ai.run("@cf/meta/llama-3.1-8b-instruct", {
		messages: [
			{
				role: "system",
				content: `You are a news collection planner.
Your job is to decide which public collection tools should be used for each keyword and how to combine them.

Available tools:
1. "google-news" - Google News RSS search, broad coverage, good for mainstream global news
2. "bing-news" - Bing News RSS search, useful as a second public search source
3. "hacker-news" - Hacker News public search, useful for developer, startup, AI, and product launches
4. "ithome-rss" - IT之家 (ithome.com) China tech RSS; fixed feed, use same keyword in "query" and "label" for filtering hints
5. "36kr-rss" - 36氪 China startup/tech RSS; fixed feed, same as ithome-rss for query/label

Rules:
- Expand Chinese keywords into useful English aliases, product names, abbreviations, or brand names when helpful
- Prefer 1-2 search terms per original keyword
- Use at most ${MAX_PLAN_STEPS} steps in total
- Each step must preserve the original user keyword in "label"
- "limit" must be an integer between 3 and ${DEFAULT_STEP_LIMIT}
- Return ONLY a JSON array

Example:
[{"tool":"google-news","query":"large language model OR OpenAI OR Gemini","label":"大模型","limit":8}]`,
			},
			{
				role: "user",
				content: `User keywords:\n${normalizedKeywords
					.map((item, index) => `${index + 1}. ${item}`)
					.join("\n")}`,
			},
		],
		max_tokens: 1024,
		temperature: 0.2,
	});

	const text =
		typeof response === "string"
			? response
			: (response as { response?: string }).response || "";

	const jsonMatch = text.match(/\[[\s\S]*\]/);
	if (!jsonMatch) {
		throw new Error("planner returned no json array");
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(jsonMatch[0]);
	} catch {
		throw new Error("planner returned invalid json");
	}

	if (!Array.isArray(parsed)) {
		throw new Error("planner response is not an array");
	}

	const keywordSet = new Set(normalizedKeywords.map((item) => item.toLowerCase()));
	const steps: CollectionPlanStep[] = [];

	for (const item of parsed) {
		if (!item || typeof item !== "object") {
			continue;
		}

		const tool = "tool" in item ? item.tool : undefined;
		const query = "query" in item ? item.query : undefined;
		const label = "label" in item ? item.label : undefined;
		const limit = "limit" in item ? item.limit : undefined;

		if (
			(tool !== "google-news" &&
				tool !== "bing-news" &&
				tool !== "hacker-news" &&
				tool !== "ithome-rss" &&
				tool !== "36kr-rss") ||
			typeof query !== "string" ||
			typeof label !== "string"
		) {
			continue;
		}

		const normalizedLabel = label.trim();
		const normalizedQuery = query.trim();
		if (!normalizedLabel || !normalizedQuery) {
			continue;
		}

		if (!keywordSet.has(normalizedLabel.toLowerCase())) {
			continue;
		}

		steps.push({
			tool,
			query: normalizedQuery,
			label: normalizedLabel,
			limit:
				typeof limit === "number" && Number.isFinite(limit)
					? Math.min(DEFAULT_STEP_LIMIT, Math.max(3, Math.round(limit)))
					: DEFAULT_STEP_LIMIT,
		});

		if (steps.length >= MAX_PLAN_STEPS) {
			break;
		}
	}

	return steps;
}

export async function filterAndTranslate(
	ai: Ai,
	items: NewsEntry[]
): Promise<NewsEntry[]> {
	const filtered: NewsEntry[] = [];

	for (let i = 0; i < items.length; i += BATCH_SIZE) {
		const batch = items.slice(i, i + BATCH_SIZE);
		try {
			const results = await processBatch(ai, batch);
			for (const result of results) {
				if (result.score < 0.5) continue;
				const original = batch.find((item) => item.id === result.id);
				if (!original) continue;

				filtered.push({
					...original,
					relevanceScore: result.score,
					tags: result.tags,
					titleZh: result.title_zh || null,
					summaryZh: result.summary_zh || null,
				});
			}
		} catch (err) {
			console.error(`[AI] Batch ${i} failed:`, err);
			for (const item of batch) {
				filtered.push({ ...item, relevanceScore: 0.6, tags: item.tags ?? [] });
			}
		}
	}

	return filtered;
}

async function processBatch(ai: Ai, batch: NewsEntry[]): Promise<AIResult[]> {
	const itemsText = batch
		.map((item, i) => {
			const summary = item.summary ? ` | ${item.summary.slice(0, 240)}` : "";
			const keyword = item.searchKeyword ? ` | keyword=${item.searchKeyword}` : "";
			return `[${i}] id=${item.id}${keyword} | ${item.title}${summary}`;
		})
		.join("\n");

	const response = await ai.run("@cf/meta/llama-3.1-8b-instruct", {
		messages: [
			{
				role: "system",
				content: `You are a multilingual news quality analyst. For each news item below:
1. Rate content quality from 0 to 1 (0 = spam/clickbait/ads/meaningless, 1 = high quality informative content worth reading)
2. Extract 1-3 topic tags in English (e.g., "politics", "technology", "finance", "space", "ai")
3. Translate the title to Simplified Chinese
4. Write a brief Simplified Chinese summary (2-3 sentences, based on title and any available description)

Summary requirements:
- The summary must add new information, context, impact, or background instead of rewriting the title
- Do not repeat the title wording or produce a second headline
- If the available information is too thin to form a meaningful summary, return an empty string for summary_zh

Return ONLY valid JSON array. Each element: {"id":"...","score":0.8,"tags":["tag1"],"title_zh":"中文标题","summary_zh":"中文摘要"}
No markdown, no explanation, just the JSON array.`,
			},
			{
				role: "user",
				content: itemsText,
			},
		],
		max_tokens: 2048,
		temperature: 0.1,
	});

	const text =
		typeof response === "string"
			? response
			: (response as { response?: string }).response || "";

	const jsonMatch = text.match(/\[[\s\S]*\]/);
	if (!jsonMatch) {
		console.error("[AI] No JSON array found in response");
		return batch.map((item) => ({
			id: item.id,
			score: 0.6,
			tags: [],
			title_zh: "",
			summary_zh: "",
		}));
	}

	try {
		return JSON.parse(jsonMatch[0]) as AIResult[];
	} catch {
		console.error("[AI] Failed to parse JSON:", jsonMatch[0].slice(0, 200));
		return batch.map((item) => ({
			id: item.id,
			score: 0.6,
			tags: [],
			title_zh: "",
			summary_zh: "",
		}));
	}
}
