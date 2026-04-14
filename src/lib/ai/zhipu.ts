import type { NewsItemSummary } from "@/lib/db/types";
import { fetchWithOptionalProxy } from "@/lib/net/fetch";

const ZHIPU_API_URL = "https://open.bigmodel.cn/api/paas/v4/chat/completions";

async function callZhipuChat(
	messages: Array<{ role: "system" | "user"; content: string }>,
	options?: {
		temperature?: number;
		maxTokens?: number;
	}
) {
	const apiKey = process.env.ZHIPU_API_KEY;
	if (!apiKey) {
		throw new Error("ZHIPU_API_KEY 未配置");
	}

	const res = await fetchWithOptionalProxy(ZHIPU_API_URL, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${apiKey}`,
		},
		body: JSON.stringify({
			model: "glm-4-flash",
			messages,
			temperature: options?.temperature ?? 0.3,
			max_tokens: options?.maxTokens ?? 1024,
		}),
		signal: AbortSignal.timeout(30000),
	});

	if (!res.ok) {
		const errText = await res.text();
		throw new Error(`智谱 API 返回 ${res.status}: ${errText}`);
	}

	const data = await res.json();
	return data.choices?.[0]?.message?.content ?? "";
}

export async function generateDigest(
	items: NewsItemSummary[],
	keywords: string[] = []
): Promise<string> {
	const keywordContext = keywords.length > 0
		? `用户关注的主题包括：${keywords.join("、")}。请围绕这些主题组织摘要板块。`
		: "请根据新闻内容自动归纳主题板块。";

	const systemPrompt = `你是一位专业的资讯编辑。请根据以下新闻条目，生成一份简洁的中文每日摘要。${keywordContext}每个板块用 2-3 句话概括核心要点。最后给出一句话总结今日趋势。`;

	// 只发送标题和摘要，节省 token
	const newsText = items
		.slice(0, 20)
		.map((item, i) => {
			const title = item.titleZh || item.title;
			const summary = item.summaryZh || item.summary || "";
			const keyword = item.searchKeyword ? ` [关键词:${item.searchKeyword}]` : "";
			return `${i + 1}. [${item.source}]${keyword} ${title}\n   ${summary}`;
		})
		.join("\n\n");

	const content = await callZhipuChat([
		{
			role: "system",
			content: systemPrompt,
		},
		{
			role: "user",
			content: `以下是今日热点资讯：\n\n${newsText}\n\n请生成今日摘要。`,
		},
	]);

	return content || "摘要生成失败";
}
