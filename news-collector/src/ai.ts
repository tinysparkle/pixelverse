import type { NewsEntry } from "./index";

interface AIResult {
	id: string;
	score: number;
	tags: string[];
	title_zh: string;
	summary_zh: string;
}

const BATCH_SIZE = 10;

export async function filterAndTranslate(
	ai: Ai,
	items: NewsEntry[]
): Promise<NewsEntry[]> {
	const filtered: NewsEntry[] = [];

	// 分批处理
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
			// 如果 AI 失败，保留所有条目（无翻译）
			for (const item of batch) {
				filtered.push({ ...item, relevanceScore: 0.6 });
			}
		}
	}

	return filtered;
}

async function processBatch(
	ai: Ai,
	batch: NewsEntry[]
): Promise<AIResult[]> {
	const itemsText = batch
		.map((item, i) => {
			const summary = item.summary ? ` | ${item.summary.slice(0, 200)}` : "";
			return `[${i}] id=${item.id} | ${item.title}${summary}`;
		})
		.join("\n");

	const response = await ai.run("@cf/meta/llama-3.1-8b-instruct", {
		messages: [
			{
				role: "system",
				content: `You are an AI news analyst. For each news item below:
1. Rate AI relevance from 0 to 1 (0 = not AI related, 1 = core AI news)
2. Extract 1-3 topic tags in English (e.g., "llm", "openai", "research", "opensource")
3. Translate the title to Simplified Chinese
4. Write a brief Chinese summary (1-2 sentences)

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

	// 提取 JSON 数组
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
