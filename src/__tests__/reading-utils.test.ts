import { describe, expect, it } from "vitest";
import {
  buildSelectionAnchor,
  computeNextReviewSchedule,
  countWords,
  createInitialReviewSchedule,
  getReadingWordRange,
  normalizeSelectedText,
  normalizeVocabText,
  splitParagraphs,
} from "@/components/reading/readingUtils";

describe("readingUtils", () => {
  it("根据篇幅返回单词区间", () => {
    expect(getReadingWordRange("short")).toEqual([180, 320]);
    expect(getReadingWordRange("medium")).toEqual([380, 720]);
    expect(getReadingWordRange("long")).toEqual([850, 1300]);
  });

  it("统计英文词数", () => {
    expect(countWords("Hello world from Pixelverse")).toBe(4);
  });

  it("分割段落", () => {
    expect(splitParagraphs("Para 1\n\nPara 2\n\nPara 3")).toEqual(["Para 1", "Para 2", "Para 3"]);
  });

  it("规范化选中文本和词条文本", () => {
    expect(normalizeSelectedText("  take   off  ")).toBe("take off");
    expect(normalizeVocabText("  Take   Off  ")).toBe("take off");
  });

  it("创建初始复习计划", () => {
    const initial = createInitialReviewSchedule(new Date("2026-04-17T00:00:00.000Z"));
    expect(initial.reviewState).toBe("learning");
    expect(initial.intervalDays).toBe(0.25);
  });

  it("again 会进入重新学习", () => {
    const result = computeNextReviewSchedule({
      reviewState: "review",
      intervalDays: 4,
      reviewCount: 3,
      lapseCount: 0,
    }, "again", new Date("2026-04-17T00:00:00.000Z"));

    expect(result.reviewState).toBe("relearning");
    expect(result.lapseCount).toBe(1);
    expect(result.intervalDays).toBe(0.25);
  });

  it("good 会拉长复习间隔", () => {
    const result = computeNextReviewSchedule({
      reviewState: "learning",
      intervalDays: 3,
      reviewCount: 2,
      lapseCount: 0,
    }, "good", new Date("2026-04-17T00:00:00.000Z"));

    expect(result.reviewState).toBe("review");
    expect(result.intervalDays).toBeGreaterThan(3);
    expect(result.reviewCount).toBe(3);
  });

  it("构建选中文本锚点", () => {
    const anchor = buildSelectionAnchor("This is a sample sentence.", "sample");
    expect(anchor).toEqual({ start: 10, end: 16, text: "sample" });
  });
});
