export type ReadingSourceType = "ai";
export type ReadingStatus = "new" | "reading" | "reviewed" | "trained";
export type ReadingLengthBucket = "short" | "medium" | "long";
export type ReadingLevel = "cet4" | "b1" | "b2";
export type VocabEntryKind = "word" | "phrase";
export type ReadingAnnotationKind = VocabEntryKind;
export type ReviewState = "new" | "learning" | "review" | "relearning";
export type ReviewGrade = "again" | "hard" | "good" | "easy";

export interface SelectionAnchor {
  start: number;
  end: number;
  text: string;
}

export interface ReviewScheduleInput {
  reviewState: ReviewState;
  intervalDays: number;
  reviewCount: number;
  lapseCount: number;
}

export interface ReviewScheduleResult {
  reviewState: ReviewState;
  intervalDays: number;
  dueAt: string;
  reviewCount: number;
  lapseCount: number;
}

const LENGTH_WORD_RANGES: Record<ReadingLengthBucket, [number, number]> = {
  short: [180, 320],
  medium: [380, 720],
  long: [850, 1300],
};

const REVIEW_INTERVALS: Record<ReviewGrade, number> = {
  again: 0.25,
  hard: 1,
  good: 3,
  easy: 6,
};

export function getReadingWordRange(length: ReadingLengthBucket): [number, number] {
  return LENGTH_WORD_RANGES[length];
}

export function countWords(text: string) {
  return text
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

export function splitParagraphs(text: string) {
  return text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

export function normalizeTopic(input: string) {
  return input.trim().slice(0, 100);
}

export function normalizeTitle(input: string) {
  const title = input.trim().slice(0, 255);
  return title || "未命名阅读";
}

export function normalizeSelectedText(input: string) {
  return input.replace(/\s+/g, " ").trim();
}

export function normalizeVocabText(input: string) {
  return normalizeSelectedText(input).toLowerCase();
}

export function createInitialReviewSchedule(now: Date = new Date()): ReviewScheduleResult {
  const dueAt = new Date(now.getTime() + 6 * 60 * 60 * 1000);
  return {
    reviewState: "learning",
    intervalDays: 0.25,
    dueAt: dueAt.toISOString(),
    reviewCount: 0,
    lapseCount: 0,
  };
}

export function computeNextReviewSchedule(
  input: ReviewScheduleInput,
  grade: ReviewGrade,
  now: Date = new Date()
): ReviewScheduleResult {
  const baseInterval = Math.max(input.intervalDays, REVIEW_INTERVALS[grade]);

  if (grade === "again") {
    return {
      reviewState: "relearning",
      intervalDays: REVIEW_INTERVALS.again,
      dueAt: new Date(now.getTime() + REVIEW_INTERVALS.again * 24 * 60 * 60 * 1000).toISOString(),
      reviewCount: input.reviewCount + 1,
      lapseCount: input.lapseCount + 1,
    };
  }

  const multiplier =
    grade === "hard"
      ? 1.4
      : grade === "good"
        ? input.reviewState === "new" ? 2 : 2.2
        : input.reviewState === "new" ? 3.5 : 4;

  const intervalDays = Math.max(REVIEW_INTERVALS[grade], Number((baseInterval * multiplier).toFixed(2)));
  const nextState = grade === "easy" || grade === "good" ? "review" : "learning";

  return {
    reviewState: nextState,
    intervalDays,
    dueAt: new Date(now.getTime() + intervalDays * 24 * 60 * 60 * 1000).toISOString(),
    reviewCount: input.reviewCount + 1,
    lapseCount: input.lapseCount,
  };
}

export function buildSelectionAnchor(fullText: string, selectedText: string, hintIndex?: number): SelectionAnchor | null {
  const normalized = normalizeSelectedText(selectedText);
  if (!normalized) return null;

  const directStart = typeof hintIndex === "number" && hintIndex >= 0
    ? fullText.indexOf(normalized, hintIndex)
    : fullText.indexOf(normalized);

  const start = directStart >= 0 ? directStart : fullText.indexOf(normalized);
  if (start < 0) return null;

  return {
    start,
    end: start + normalized.length,
    text: normalized,
  };
}

export function getTodayReviewCount<T extends { dueAt: string; deletedAt?: string | null }>(items: T[], now: Date = new Date()) {
  return items.filter((item) => !item.deletedAt && new Date(item.dueAt).getTime() <= now.getTime()).length;
}
