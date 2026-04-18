import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import ReadingPage from "@/components/reading/ReadingPage";

const replaceMock = vi.fn();
const speakMock = vi.fn();
const stopMock = vi.fn();

function createSelection(text: string, anchorStart = 5, anchorEnd = anchorStart + text.length) {
  return {
    text,
    anchorStart,
    anchorEnd,
    rect: new DOMRect(120, 120, 48, 20),
    mode: "add" as const,
  };
}

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock }),
  useSearchParams: () => ({
    get: () => null,
    toString: () => "",
  }),
  usePathname: () => "/reading",
}));

vi.mock("@/components/reading/ArticleReader", () => ({
  default: function MockArticleReader({
    item,
    onSelectionChange,
  }: {
    item: { id: string } | null;
    onSelectionChange: (payload: ReturnType<typeof createSelection> | null) => void;
  }) {
    if (!item) {
      return <div>waiting-item</div>;
    }

    return (
      <div>
        <button type="button" onClick={() => onSelectionChange(createSelection("focused", 10, 17))}>
          select-short
        </button>
        <button
          type="button"
          onClick={() => onSelectionChange(createSelection("this selection is definitely longer than six tokens for testing", 20, 81))}
        >
          select-long
        </button>
        <button type="button" onClick={() => onSelectionChange(null)}>
          clear-selection
        </button>
      </div>
    );
  },
}));

vi.mock("@/components/reading/CurrentArticleVocab", () => ({
  default: function MockCurrentArticleVocab() {
    return <div>mock-vocab</div>;
  },
}));

vi.mock("@/components/reading/ReadingHeader", () => ({
  default: function MockReadingHeader() {
    return <div>mock-header</div>;
  },
}));

vi.mock("@/components/reading/ReadingSidebar", () => ({
  default: function MockReadingSidebar() {
    return <div>mock-sidebar</div>;
  },
}));

vi.mock("@/components/reading/usePronunciation", () => ({
  usePronunciation: () => ({
    speak: speakMock,
    stop: stopMock,
    supported: true,
    speakingText: null,
  }),
}));

describe("ReadingPage", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input.toString();

      if (url === "/api/reading") {
        return {
          ok: true,
          json: async () => [],
        } as Response;
      }

      return {
        ok: true,
        json: async () => ({}),
      } as Response;
    }) as typeof fetch;
  });

  afterEach(() => {
    cleanup();
    global.fetch = originalFetch;
    vi.clearAllMocks();
  });

  it("不再渲染本文练习入口", () => {
    render(<ReadingPage />);

    expect(screen.queryByText("本文练习")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "生成词汇练习" })).not.toBeInTheDocument();
  });

  it("选中后立即分析，并在重复选中同一段时复用本页缓存", async () => {
    let resolveInsight: ((value: unknown) => void) | null = null;
    let insightRequestCount = 0;

    global.fetch = vi.fn((async (input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input.toString();

      if (url === "/api/reading") {
        return {
          ok: true,
          json: async () => [{
            id: "item-1",
            title: "Focus",
            topic: "science",
            level: "cet4",
            lengthBucket: "medium",
            status: "new",
            wordCount: 120,
            updatedAt: "2026-04-18T00:00:00.000Z",
            excerpt: "focus excerpt",
          }],
        } as Response;
      }

      if (url === "/api/reading/item-1") {
        return {
          ok: true,
          json: async () => ({
            id: "item-1",
            userId: "user-1",
            title: "Focus",
            sourceType: "ai",
            topic: "science",
            level: "cet4",
            lengthBucket: "medium",
            status: "new",
            generationPromptJson: null,
            contentText: "She stayed focused during the discussion.",
            contentJson: null,
            wordCount: 120,
            createdAt: "2026-04-18T00:00:00.000Z",
            updatedAt: "2026-04-18T00:00:00.000Z",
            deletedAt: null,
          }),
        } as Response;
      }

      if (url === "/api/reading/item-1/annotations") {
        return {
          ok: true,
          json: async () => [],
        } as Response;
      }

      if (url === "/api/reading/item-1/insights") {
        insightRequestCount += 1;
        return {
          ok: true,
          json: async () => new Promise((resolve) => {
            resolveInsight = resolve;
          }),
        } as Response;
      }

      return {
        ok: true,
        json: async () => ({}),
      } as Response;
    }) as typeof fetch);

    render(<ReadingPage />);

    await screen.findByRole("button", { name: "select-short" });

    fireEvent.click(screen.getByRole("button", { name: "select-short" }));

    await waitFor(() => expect(insightRequestCount).toBe(1));
    expect(screen.getByText("focused")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "加入生词" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "加入短语" })).toBeInTheDocument();

    resolveInsight?.({
      id: "insight-1",
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

    await screen.findByText("专注的");

    fireEvent.pointerDown(document.body);
    await waitFor(() => expect(screen.queryByText("专注的")).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "select-short" }));

    await screen.findByText("专注的");
    expect(insightRequestCount).toBe(1);
  });

  it("选中过长文本时直接提示限制，不调用 insights 接口", async () => {
    let insightRequestCount = 0;

    global.fetch = vi.fn((async (input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input.toString();

      if (url === "/api/reading") {
        return {
          ok: true,
          json: async () => [{
            id: "item-1",
            title: "Focus",
            topic: "science",
            level: "cet4",
            lengthBucket: "medium",
            status: "new",
            wordCount: 120,
            updatedAt: "2026-04-18T00:00:00.000Z",
            excerpt: "focus excerpt",
          }],
        } as Response;
      }

      if (url === "/api/reading/item-1") {
        return {
          ok: true,
          json: async () => ({
            id: "item-1",
            userId: "user-1",
            title: "Focus",
            sourceType: "ai",
            topic: "science",
            level: "cet4",
            lengthBucket: "medium",
            status: "new",
            generationPromptJson: null,
            contentText: "She stayed focused during the discussion.",
            contentJson: null,
            wordCount: 120,
            createdAt: "2026-04-18T00:00:00.000Z",
            updatedAt: "2026-04-18T00:00:00.000Z",
            deletedAt: null,
          }),
        } as Response;
      }

      if (url === "/api/reading/item-1/annotations") {
        return {
          ok: true,
          json: async () => [],
        } as Response;
      }

      if (url === "/api/reading/item-1/insights") {
        insightRequestCount += 1;
      }

      return {
        ok: true,
        json: async () => ({}),
      } as Response;
    }) as typeof fetch);

    render(<ReadingPage />);

    await screen.findByRole("button", { name: "select-long" });
    fireEvent.click(screen.getByRole("button", { name: "select-long" }));

    await screen.findByText("仅支持单词或短语");
    expect(insightRequestCount).toBe(0);
    expect(screen.getByRole("button", { name: "加入生词" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "加入短语" })).toBeInTheDocument();
  });
});
