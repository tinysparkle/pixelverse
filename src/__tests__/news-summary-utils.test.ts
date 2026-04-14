import { describe, expect, test } from "vitest";
import { shouldShowDistinctSummary } from "@/components/news/summary-utils";

describe("shouldShowDistinctSummary", () => {
	test("隐藏与标题完全相同的摘要", () => {
		expect(shouldShowDistinctSummary("OpenAI 发布新模型", "OpenAI 发布新模型")).toBe(false);
	});

	test("隐藏只是轻微改写标题的摘要", () => {
		expect(
			shouldShowDistinctSummary(
				"Gemini 2.5 Pro 正式开放",
				"Gemini 2.5 Pro 正式开放，Gemini 2.5 Pro 现已面向开发者提供。"
			)
		).toBe(false);
	});

	test("保留提供额外信息的摘要", () => {
		expect(
			shouldShowDistinctSummary(
				"OpenAI 发布 Codex 更新",
				"这次更新增加了更强的代码补全能力，并扩大了企业用户可用区域。"
			)
		).toBe(true);
	});
});
