import { describe, expect, test, vi, afterEach } from "vitest";
import {
	buildNewsCollectRequest,
	collectNewsViaWorker,
} from "@/lib/news/worker-client";
import { verifyNewsIngestSecret } from "@/lib/news/ingest-auth";
import type { NextRequest } from "next/server";

function makeIngestRequest(auth: string | null): NextRequest {
	return {
		headers: {
			get(name: string) {
				if (name.toLowerCase() === "authorization") return auth;
				return null;
			},
		},
	} as NextRequest;
}

describe("buildNewsCollectRequest", () => {
	test("只发送已启用的原始关键词，不再拼接扩展词缓存", () => {
		expect(
			buildNewsCollectRequest([
				{
					id: "1",
					userId: "u1",
					keyword: "大模型",
					expandedKeywords: ["Codex", "Gemini", "Grok"],
					expandedAt: "2026-04-14T10:00:00.000Z",
					enabled: true,
					createdAt: "2026-04-14T10:00:00.000Z",
				},
				{
					id: "2",
					userId: "u1",
					keyword: "AI 编程",
					expandedKeywords: ["Cursor"],
					expandedAt: "2026-04-14T10:00:00.000Z",
					enabled: true,
					createdAt: "2026-04-14T10:00:00.000Z",
				},
				{
					id: "3",
					userId: "u1",
					keyword: "忽略我",
					expandedKeywords: ["Ignore me"],
					expandedAt: null,
					enabled: false,
					createdAt: "2026-04-14T10:00:00.000Z",
				},
			])
		).toEqual({
			keywords: ["大模型", "AI 编程"],
		});
	});
});

describe("collectNewsViaWorker", () => {
	test("调用 Worker 的 /api/collect 并返回标准化结果", async () => {
		const fetchImpl = vi.fn().mockResolvedValue(
			new Response(
				JSON.stringify({
					items: [
						{
							id: "news-1",
							source: "google-news",
							sourceUrl: "https://example.com/news-1",
							title: "OpenAI 发布更新",
							relevanceScore: 0.91,
						},
					],
				}),
				{
					status: 200,
					headers: { "Content-Type": "application/json" },
				}
			)
		);

		const items = await collectNewsViaWorker(
			{
				workerUrl: "https://worker.example.com",
				workerSecret: "secret",
				keywords: ["大模型", "AI 编程"],
			},
			fetchImpl
		);

		expect(fetchImpl).toHaveBeenCalledWith(
			"https://worker.example.com/api/collect",
			expect.objectContaining({
				method: "POST",
				headers: expect.objectContaining({
					Authorization: "Bearer secret",
					"Content-Type": "application/json",
				}),
				body: JSON.stringify({ keywords: ["大模型", "AI 编程"] }),
			})
		);

		expect(items).toEqual([
			expect.objectContaining({
				id: "news-1",
				source: "google-news",
				sourceUrl: "https://example.com/news-1",
				title: "OpenAI 发布更新",
				relevanceScore: 0.91,
				tags: [],
				titleZh: null,
				summary: null,
				summaryZh: null,
				content: null,
				searchKeyword: null,
				publishedAt: null,
			}),
		]);
	});
});

describe("verifyNewsIngestSecret", () => {
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("未配置 NEWS_INGEST_SECRET 时拒绝", () => {
		vi.stubEnv("NEWS_INGEST_SECRET", "");
		expect(verifyNewsIngestSecret(makeIngestRequest("Bearer x"))).toBe(false);
	});

	test("Bearer 一致时通过", () => {
		vi.stubEnv("NEWS_INGEST_SECRET", "secret-one");
		expect(verifyNewsIngestSecret(makeIngestRequest("Bearer secret-one"))).toBe(true);
	});

	test("Bearer 不一致时拒绝", () => {
		vi.stubEnv("NEWS_INGEST_SECRET", "secret-one");
		expect(verifyNewsIngestSecret(makeIngestRequest("Bearer other"))).toBe(false);
	});
});
