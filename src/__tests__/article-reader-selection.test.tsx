import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import ArticleReader from "@/components/reading/ArticleReader";
import type { ReadingItemRecord } from "@/lib/db/types";
import type { ReadingSelectionPayload } from "@/components/reading/SelectionPopover";

const ITEM: ReadingItemRecord = {
  id: "item-1",
  userId: "user-1",
  title: "Focus",
  sourceType: "ai",
  topic: "science",
  level: "cet4",
  lengthBucket: "medium",
  status: "new",
  generationPromptJson: null,
  contentText: "Focused people learn faster.",
  contentJson: null,
  wordCount: 4,
  createdAt: "2026-04-18T00:00:00.000Z",
  updatedAt: "2026-04-18T00:00:00.000Z",
  deletedAt: null,
};

function createMockRange(textNode: Node, startOffset: number, endOffset: number) {
  return {
    startContainer: textNode,
    endContainer: textNode,
    startOffset,
    endOffset,
    commonAncestorContainer: textNode,
    getBoundingClientRect: () => new DOMRect(120, 120, 48, 20),
  } as unknown as Range;
}

describe("ArticleReader selection stabilization", () => {
  const originalGetSelection = window.getSelection;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    window.getSelection = originalGetSelection;
    vi.restoreAllMocks();
  });

  it("拖拽选区只会在 pointerup 后触发一次最终回调", () => {
    const onSelectionChange = vi.fn<(payload: ReadingSelectionPayload | null) => void>();
    const { container } = render(
      <ArticleReader
        item={ITEM}
        annotations={[]}
        focusAnnotationId={null}
        onSelectionChange={onSelectionChange}
        onPronounce={vi.fn()}
        pronunciationSupported
        speakingText={null}
      />
    );

    const articleBody = container.querySelector("[class*='articleBody']") as HTMLElement;
    const textNode = articleBody.querySelector("[data-offset='0']")?.firstChild as Node;
    let currentRange = createMockRange(textNode, 0, 4);

    window.getSelection = vi.fn(() => ({
      rangeCount: 1,
      isCollapsed: false,
      getRangeAt: () => currentRange,
    })) as typeof window.getSelection;

    fireEvent.pointerDown(articleBody);
    currentRange = createMockRange(textNode, 0, 3);
    document.dispatchEvent(new Event("selectionchange"));
    currentRange = createMockRange(textNode, 0, 7);
    document.dispatchEvent(new Event("selectionchange"));

    const nonNullCallsBeforeRelease = onSelectionChange.mock.calls
      .map(([payload]) => payload)
      .filter(Boolean);
    expect(nonNullCallsBeforeRelease).toHaveLength(0);

    fireEvent.pointerUp(articleBody);
    vi.advanceTimersByTime(199);
    expect(onSelectionChange.mock.calls.map(([payload]) => payload).filter(Boolean)).toHaveLength(0);

    vi.advanceTimersByTime(1);

    const finalSelections = onSelectionChange.mock.calls
      .map(([payload]) => payload)
      .filter((payload): payload is ReadingSelectionPayload => payload !== null);

    expect(finalSelections).toHaveLength(1);
    expect(finalSelections[0]).toMatchObject({
      text: "Focused",
      anchorStart: 0,
      anchorEnd: 7,
      mode: "add",
    });
  });

  it("键盘或非拖拽选区在 debounce 后只触发一次", () => {
    const onSelectionChange = vi.fn<(payload: ReadingSelectionPayload | null) => void>();
    const { container } = render(
      <ArticleReader
        item={ITEM}
        annotations={[]}
        focusAnnotationId={null}
        onSelectionChange={onSelectionChange}
        onPronounce={vi.fn()}
        pronunciationSupported
        speakingText={null}
      />
    );

    const articleBody = container.querySelector("[class*='articleBody']") as HTMLElement;
    const textNode = articleBody.querySelector("[data-offset='0']")?.firstChild as Node;
    let currentRange = createMockRange(textNode, 0, 4);

    window.getSelection = vi.fn(() => ({
      rangeCount: 1,
      isCollapsed: false,
      getRangeAt: () => currentRange,
    })) as typeof window.getSelection;

    document.dispatchEvent(new Event("selectionchange"));
    vi.advanceTimersByTime(120);
    currentRange = createMockRange(textNode, 0, 7);
    document.dispatchEvent(new Event("selectionchange"));

    vi.advanceTimersByTime(199);
    expect(onSelectionChange.mock.calls.map(([payload]) => payload).filter(Boolean)).toHaveLength(0);

    vi.advanceTimersByTime(1);

    const finalSelections = onSelectionChange.mock.calls
      .map(([payload]) => payload)
      .filter((payload): payload is ReadingSelectionPayload => payload !== null);

    expect(finalSelections).toHaveLength(1);
    expect(finalSelections[0]).toMatchObject({
      text: "Focused",
      anchorStart: 0,
      anchorEnd: 7,
      mode: "add",
    });
  });
});
