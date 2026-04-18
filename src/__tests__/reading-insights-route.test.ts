import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const authMock = vi.fn();
const getReadingItemByIdForUserMock = vi.fn();
const getReadingTermInsightByNormalizedTextForUserMock = vi.fn();
const upsertReadingTermInsightForUserMock = vi.fn();
const generateTermInsightMock = vi.fn();

vi.mock("@/lib/auth", () => ({
  auth: authMock,
}));

vi.mock("@/lib/ai/reading", () => ({
  generateTermInsight: generateTermInsightMock,
}));

vi.mock("@/lib/db/queries", () => ({
  getReadingItemByIdForUser: getReadingItemByIdForUserMock,
  getReadingTermInsightByNormalizedTextForUser: getReadingTermInsightByNormalizedTextForUserMock,
  upsertReadingTermInsightForUser: upsertReadingTermInsightForUserMock,
}));

describe("POST /api/reading/[id]/insights", () => {
  beforeEach(() => {
    vi.resetModules();
    authMock.mockReset();
    getReadingItemByIdForUserMock.mockReset();
    getReadingTermInsightByNormalizedTextForUserMock.mockReset();
    upsertReadingTermInsightForUserMock.mockReset();
    generateTermInsightMock.mockReset();
  });

  it("缓存表不可用时仍返回 200 的 AI 分析结果", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    getReadingItemByIdForUserMock.mockResolvedValue({
      id: "item-1",
      userId: "user-1",
      title: "Focus",
      contentText: "She stayed focused during the discussion.",
    });
    getReadingTermInsightByNormalizedTextForUserMock.mockResolvedValue(null);
    generateTermInsightMock.mockResolvedValue({
      detected_kind: "word",
      gloss_cn: "专注的",
      phonetic: "/ˈfəʊ.kəst/",
      part_of_speech: "adjective",
      grammar_tags: ["past participle"],
      definition_en: "giving full attention to something",
      example_en: "She stayed focused during the discussion.",
      example_cn: "她在讨论中始终很专注。",
    });
    upsertReadingTermInsightForUserMock.mockResolvedValue({
      id: "tmp-insight",
      userId: "user-1",
      text: "focused",
      normalizedText: "focused",
      detectedKind: "word",
      glossCn: "专注的",
      phonetic: "/ˈfəʊ.kəst/",
      partOfSpeech: "adjective",
      grammarTags: ["past participle"],
      definitionEn: "giving full attention to something",
      exampleEn: "She stayed focused during the discussion.",
      exampleCn: "她在讨论中始终很专注。",
      sourceSentence: "She stayed focused during the discussion.",
      createdAt: "2026-04-18T00:00:00.000Z",
      updatedAt: "2026-04-18T00:00:00.000Z",
      fromCache: false,
    });

    const { POST } = await import("@/app/api/reading/[id]/insights/route");
    const request = new NextRequest("http://localhost/api/reading/item-1/insights", {
      method: "POST",
      body: JSON.stringify({
        selectedText: "focused",
        anchorStart: 11,
        anchorEnd: 18,
      }),
      headers: {
        "Content-Type": "application/json",
      },
    });

    const response = await POST(request, {
      params: Promise.resolve({ id: "item-1" }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      text: "focused",
      glossCn: "专注的",
      fromCache: false,
    });
  });
});
