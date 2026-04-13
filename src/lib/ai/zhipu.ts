import type { NewsItemSummary } from "@/lib/db/types";
import { fetchWithOptionalProxy } from "@/lib/net/fetch";

const ZHIPU_API_URL = "https://open.bigmodel.cn/api/paas/v4/chat/completions";

export async function generateDigest(items: NewsItemSummary[]): Promise<string> {
	const apiKey = process.env.ZHIPU_API_KEY;
	if (!apiKey) {
		throw new Error("ZHIPU_API_KEY 未配置");
	}

	// 只发送标题和摘要，节省 token
	const newsText = items
		.slice(0, 20)
		.map((item, i) => {
			const title = item.titleZh || item.title;
			const summary = item.summaryZh || item.summary || "";
			return `${i + 1}. [${item.source}] ${title}\n   ${summary}`;
		})
		.join("\n\n");

	const res = await fetchWithOptionalProxy(ZHIPU_API_URL, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${apiKey}`,
		},
		body: JSON.stringify({
			model: "glm-4-flash",
			messages: [
				{
					role: "system",
					content:
						"你是一位专业的 AI 行业资讯编辑。请根据以下新闻条目，生成一份简洁的中文每日摘要。分为几个主题板块（如：大模型、产品发布、开源、研究论文、行业动态等），每个板块用 2-3 句话概括核心要点。最后给出一句话总结今日趋势。",
				},
				{
					role: "user",
					content: `以下是今日 AI 资讯：\n\n${newsText}\n\n请生成今日摘要。`,
				},
			],
			temperature: 0.3,
			max_tokens: 1024,
		}),
		signal: AbortSignal.timeout(30000),
	});

	if (!res.ok) {
		const errText = await res.text();
		throw new Error(`智谱 API 返回 ${res.status}: ${errText}`);
	}

	const data = await res.json();
	return data.choices?.[0]?.message?.content ?? "摘要生成失败";
}
