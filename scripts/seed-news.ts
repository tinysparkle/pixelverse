import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { randomUUID } from "node:crypto";
import { executeStatement, closePool } from "@/lib/db";

const SAMPLE_NEWS = [
	{
		source: "openai",
		sourceUrl: "https://openai.com/blog/gpt-5-announcement",
		title: "Introducing GPT-5",
		titleZh: "GPT-5 正式发布",
		summary: "OpenAI announces GPT-5 with significant improvements in reasoning and multimodal capabilities.",
		summaryZh: "OpenAI 发布 GPT-5，在推理和多模态能力方面有重大提升。",
		relevanceScore: 0.95,
		tags: "openai,gpt,大模型",
		publishedAt: new Date(Date.now() - 2 * 3600000).toISOString(),
	},
	{
		source: "anthropic",
		sourceUrl: "https://anthropic.com/news/claude-opus-4",
		title: "Claude Opus 4: A New Frontier in AI Safety",
		titleZh: "Claude Opus 4：AI 安全新前沿",
		summary: "Anthropic releases Claude Opus 4 with enhanced safety features and improved coding abilities.",
		summaryZh: "Anthropic 发布 Claude Opus 4，增强了安全特性和编程能力。",
		relevanceScore: 0.93,
		tags: "anthropic,claude,安全",
		publishedAt: new Date(Date.now() - 5 * 3600000).toISOString(),
	},
	{
		source: "google-ai",
		sourceUrl: "https://blog.google/technology/ai/gemini-2-ultra",
		title: "Gemini 2 Ultra: Pushing the Boundaries of Multimodal AI",
		titleZh: "Gemini 2 Ultra：突破多模态 AI 的边界",
		summary: "Google DeepMind unveils Gemini 2 Ultra with native audio, video, and code generation.",
		summaryZh: "Google DeepMind 发布 Gemini 2 Ultra，支持原生音频、视频和代码生成。",
		relevanceScore: 0.91,
		tags: "google,gemini,多模态",
		publishedAt: new Date(Date.now() - 8 * 3600000).toISOString(),
	},
	{
		source: "hackernews",
		sourceUrl: "https://github.com/open-source-llm/llama-4",
		title: "Llama 4 Open Source Release",
		titleZh: "Llama 4 开源发布",
		summary: "Meta releases Llama 4 with 400B parameters under an open license, challenging proprietary models.",
		summaryZh: "Meta 以开放许可发布拥有 4000 亿参数的 Llama 4，挑战闭源模型。",
		relevanceScore: 0.88,
		tags: "meta,llama,开源",
		publishedAt: new Date(Date.now() - 12 * 3600000).toISOString(),
	},
	{
		source: "techcrunch",
		sourceUrl: "https://techcrunch.com/2026/04/12/ai-startup-funding-q1",
		title: "AI Startup Funding Hits $50B in Q1 2026",
		titleZh: "2026年Q1 AI 初创融资达 500 亿美元",
		summary: "Venture capital investment in AI startups reached a record $50 billion in the first quarter.",
		summaryZh: "AI 初创公司风险投资在第一季度创下 500 亿美元新纪录。",
		relevanceScore: 0.72,
		tags: "投融资,行业动态",
		publishedAt: new Date(Date.now() - 18 * 3600000).toISOString(),
	},
	{
		source: "ainews",
		sourceUrl: "https://buttondown.com/ainews/2026-04-12",
		title: "AI News Daily Digest - April 12",
		titleZh: "AI 每日速递 - 4月12日",
		summary: "Top AI stories: New benchmarks show reasoning models plateau, EU AI Act enforcement begins, Stability AI open-sources video model.",
		summaryZh: "今日热点：新基准测试显示推理模型遇到瓶颈、欧盟 AI 法案开始执行、Stability AI 开源视频模型。",
		relevanceScore: 0.85,
		tags: "日报,综合",
		publishedAt: new Date(Date.now() - 24 * 3600000).toISOString(),
	},
	{
		source: "theverge",
		sourceUrl: "https://theverge.com/2026/4/12/ai-agents-workplace",
		title: "AI Agents Are Reshaping How We Work",
		titleZh: "AI 智能体正在重塑我们的工作方式",
		summary: "From coding assistants to autonomous research agents, AI is fundamentally changing workplace productivity.",
		summaryZh: "从编程助手到自主研究智能体，AI 正从根本上改变工作效率。",
		relevanceScore: 0.68,
		tags: "智能体,职场",
		publishedAt: new Date(Date.now() - 30 * 3600000).toISOString(),
	},
	{
		source: "tldr-ai",
		sourceUrl: "https://tldr.tech/ai/2026-04-11",
		title: "TLDR AI: Diffusion Models Break New Ground in 3D Generation",
		titleZh: "TLDR AI：扩散模型在 3D 生成领域取得新突破",
		summary: "Researchers demonstrate real-time 3D scene generation using improved diffusion architectures.",
		summaryZh: "研究人员展示了使用改进的扩散架构实现实时 3D 场景生成。",
		relevanceScore: 0.78,
		tags: "扩散模型,3D,论文",
		publishedAt: new Date(Date.now() - 36 * 3600000).toISOString(),
	},
];

async function main() {
	console.log("Seeding news_items...");

	let inserted = 0;
	for (const item of SAMPLE_NEWS) {
		try {
			await executeStatement(
				`INSERT IGNORE INTO news_items (id, source, source_url, title, title_zh, summary, summary_zh, relevance_score, tags, published_at)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
				[
					randomUUID(),
					item.source,
					item.sourceUrl,
					item.title,
					item.titleZh,
					item.summary,
					item.summaryZh,
					item.relevanceScore,
					item.tags,
					item.publishedAt,
				]
			);
			inserted++;
		} catch (err) {
			console.warn(`Skipped: ${item.title}`, err);
		}
	}

	console.log(`Inserted ${inserted} / ${SAMPLE_NEWS.length} news items.`);
	await closePool();
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
