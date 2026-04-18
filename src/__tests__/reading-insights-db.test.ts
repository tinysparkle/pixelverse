import { beforeEach, describe, expect, it, vi } from "vitest";

const queryRowsMock = vi.fn();
const executeStatementMock = vi.fn();

vi.mock("@/lib/db", () => ({
  queryRows: queryRowsMock,
  executeStatement: executeStatementMock,
  getPool: () => ({
    getConnection: vi.fn(),
  }),
}));

describe("reading term insights db fallback", () => {
  beforeEach(() => {
    vi.resetModules();
    queryRowsMock.mockReset();
    executeStatementMock.mockReset();
    vi.restoreAllMocks();
  });

  it("缺少 reading_term_insights 表时读取缓存按未命中处理", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    queryRowsMock.mockRejectedValueOnce({
      code: "ER_NO_SUCH_TABLE",
      message: "Table 'pixelverse.reading_term_insights' doesn't exist",
    });

    const { getReadingTermInsightByNormalizedTextForUser } = await import("@/lib/db/queries");
    const result = await getReadingTermInsightByNormalizedTextForUser("user-1", "focused");

    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it("缺少 reading_term_insights 表时写入缓存会降级返回临时 insight", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    executeStatementMock.mockRejectedValueOnce({
      code: "ER_NO_SUCH_TABLE",
      message: "Table 'pixelverse.reading_term_insights' doesn't exist",
    });

    const { upsertReadingTermInsightForUser } = await import("@/lib/db/queries");
    const result = await upsertReadingTermInsightForUser("user-1", {
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
    });

    expect(result).toMatchObject({
      userId: "user-1",
      text: "focused",
      normalizedText: "focused",
      detectedKind: "word",
      glossCn: "专注的",
      fromCache: false,
    });
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });
});
