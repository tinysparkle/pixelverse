"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type {
  ReadingAnnotationRecord,
  ReadingItemRecord,
  ReadingItemSummary,
  ReadingPracticeRecord,
} from "@/lib/db/types";
import ArticleReader from "./ArticleReader";
import CurrentArticleVocab from "./CurrentArticleVocab";
import ReadingHeader from "./ReadingHeader";
import ReadingSidebar from "./ReadingSidebar";
import SelectionPopover, { type ReadingSelectionPayload } from "./SelectionPopover";
import shellStyles from "./reading-shell.module.css";
import styles from "./reading.module.css";

type TopicPreset = "news" | "science" | "story" | "exam";

type PracticeResponse = {
  record: ReadingPracticeRecord | null;
  practice: {
    title: string;
    practice_type: "vocab";
    questions: Array<{
      id: string;
      type: "vocab";
      prompt: string;
      choices: string[];
      answer: string;
      explanation_cn: string;
      related_vocab_entry_id: string | null;
    }>;
  };
};

export default function ReadingPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedItemId = searchParams.get("item");
  const requestedAnchorId = searchParams.get("anchor");

  const [items, setItems] = useState<ReadingItemSummary[]>([]);
  const [activeItem, setActiveItem] = useState<ReadingItemRecord | null>(null);
  const [annotations, setAnnotations] = useState<ReadingAnnotationRecord[]>([]);
  const [practice, setPractice] = useState<PracticeResponse["practice"] | null>(null);
  const [practiceRecord, setPracticeRecord] = useState<ReadingPracticeRecord | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [practiceResult, setPracticeResult] = useState<{
    score: number;
    results: Array<{ id: string; correct: boolean; correctAnswer: string; explanation: string; userAnswer: string }>;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [selectedTopic, setSelectedTopic] = useState<TopicPreset>("science");
  const [lengthBucket, setLengthBucket] = useState<"short" | "medium" | "long">("medium");
  const [selection, setSelection] = useState<ReadingSelectionPayload | null>(null);
  const [focusAnnotationId, setFocusAnnotationId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState("选中文本后可以直接加入生词或短语。");

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/reading");
      if (!res.ok) return;
      const data: ReadingItemSummary[] = await res.json();
      setItems(data);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadAnnotations = useCallback(async (itemId: string) => {
    const res = await fetch(`/api/reading/${itemId}/annotations`);
    if (!res.ok) return [];
    const data: ReadingAnnotationRecord[] = await res.json();
    setAnnotations(data);
    return data;
  }, []);

  const openItem = useCallback(async (itemId: string) => {
    const itemRes = await fetch(`/api/reading/${itemId}`);
    if (!itemRes.ok) return;

    const item: ReadingItemRecord = await itemRes.json();
    setActiveItem(item);
    setSelection(null);
    await loadAnnotations(itemId);

    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.set("item", itemId);
    nextParams.delete("anchor");
    router.replace(`/reading?${nextParams.toString()}`, { scroll: false });
  }, [loadAnnotations, router, searchParams]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  useEffect(() => {
    if (!items.length) return;

    if (requestedItemId && requestedItemId !== activeItem?.id) {
      openItem(requestedItemId);
      return;
    }

    if (!activeItem?.id) {
      openItem(items[0].id);
    }
  }, [items, requestedItemId, activeItem?.id, openItem]);

  const jumpToAnnotation = useCallback((annotationId: string) => {
    setFocusAnnotationId(annotationId);
    const target = document.querySelector<HTMLElement>(`[data-annotation-id="${annotationId}"]`);
    target?.scrollIntoView({ behavior: "smooth", block: "center" });

    const nextParams = new URLSearchParams(searchParams.toString());
    if (activeItem?.id) nextParams.set("item", activeItem.id);
    nextParams.set("anchor", annotationId);
    router.replace(`/reading?${nextParams.toString()}`, { scroll: false });

    window.setTimeout(() => setFocusAnnotationId((value) => (value === annotationId ? null : value)), 1400);
  }, [activeItem?.id, router, searchParams]);

  useEffect(() => {
    if (!requestedAnchorId || !annotations.length) return;
    const timer = window.setTimeout(() => {
      jumpToAnnotation(requestedAnchorId);
    }, 60);
    return () => window.clearTimeout(timer);
  }, [requestedAnchorId, annotations, jumpToAnnotation]);

  async function handleGenerateArticle() {
    setBusy(true);
    setStatusMessage("正在生成新的阅读文章...");
    try {
      const res = await fetch("/api/reading/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic:
            selectedTopic === "news"
              ? "新闻时事"
              : selectedTopic === "science"
                ? "科普阅读"
                : selectedTopic === "story"
                  ? "短篇故事"
                  : "考试风格",
          level: "cet4",
          lengthBucket,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setStatusMessage(data.error ?? "生成文章失败。");
        return;
      }

      setStatusMessage(`已生成《${data.generated.title}》，开始阅读吧。`);
      await fetchItems();
      if (data.item?.id) {
        await openItem(data.item.id);
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleAddAnnotation(kind: "word" | "phrase", noteText?: string | null) {
    if (!activeItem || !selection) return;

    const pendingSelection = selection;
    setSelection(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/reading/${activeItem.id}/annotations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          selectedText: pendingSelection.text,
          anchorStart: pendingSelection.anchorStart,
          anchorEnd: pendingSelection.anchorEnd,
          noteText: noteText ?? null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatusMessage(data.error ?? "创建标注失败。");
        return;
      }

      setAnnotations((current) => [...current, data].sort((left, right) => left.anchorStart - right.anchorStart));
      setFocusAnnotationId(data.id);
      setStatusMessage("词条已加入生词系统。");
      window.setTimeout(() => setFocusAnnotationId((value) => (value === data.id ? null : value)), 1200);
    } finally {
      setBusy(false);
    }
  }

  async function handleGeneratePractice() {
    if (!activeItem) return;

    setBusy(true);
    setStatusMessage("正在根据本文词条生成练习...");
    try {
      const res = await fetch(`/api/reading/${activeItem.id}/practice`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const data = await res.json();
      if (!res.ok) {
        setStatusMessage(data.error ?? "生成练习失败。");
        return;
      }

      setPractice(data.practice);
      setPracticeRecord(data.record);
      setAnswers({});
      setPracticeResult(null);
      setStatusMessage("练习已生成，可以开始答题。");
    } finally {
      setBusy(false);
    }
  }

  async function handleSubmitPractice() {
    if (!activeItem || !practiceRecord) return;

    setBusy(true);
    try {
      const res = await fetch(`/api/reading/${activeItem.id}/submit-practice`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          practiceId: practiceRecord.id,
          answers: Object.entries(answers).map(([id, answer]) => ({ id, answer })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatusMessage(data.error ?? "提交练习失败。");
        return;
      }

      setPracticeResult({ score: data.score, results: data.results });
      setStatusMessage(`练习完成，得分 ${data.score} 分。`);
    } finally {
      setBusy(false);
    }
  }

  const uniqueVocabCount = useMemo(() => {
    return new Set(annotations.map((annotation) => annotation.vocabEntryId).filter(Boolean)).size;
  }, [annotations]);

  return (
    <main className={shellStyles.page}>
      <ReadingHeader subtitle="阅读、积累、复习统一在一套纸面学习流里。" />

      <div className={styles.status}>
        <span className={styles.statusText}>
          {loading ? "正在加载阅读空间..." : statusMessage}
        </span>
        <span className={styles.badgeRow}>
          <span className={styles.badge}>文章 {items.length}</span>
          <span className={styles.badge}>词条 {uniqueVocabCount}</span>
        </span>
      </div>

      <div className={styles.layout}>
        <ReadingSidebar
          items={items}
          activeItemId={activeItem?.id ?? null}
          busy={busy}
          selectedTopic={selectedTopic}
          lengthBucket={lengthBucket}
          onTopicChange={setSelectedTopic}
          onLengthChange={setLengthBucket}
          onGenerate={handleGenerateArticle}
          onOpenItem={openItem}
        />

        <div>
          <ArticleReader
            item={activeItem}
            annotations={annotations}
            focusAnnotationId={focusAnnotationId}
            onSelectionChange={setSelection}
          />

          {practice ? (
            <section className={`${styles.readerPanel} ${styles.practiceCard}`}>
              <span className={styles.panelTitle}>本文练习</span>
              <h2 className={styles.articleTitle} style={{ marginTop: 10 }}>
                {practice.title}
              </h2>

              <div className={styles.questionList}>
                {practice.questions.map((question) => (
                  <div key={question.id} className={styles.questionCard}>
                    <div className={styles.badgeRow}>
                      <span className={styles.badge}>词汇题</span>
                    </div>
                    <p style={{ marginTop: 10 }}>{question.prompt}</p>
                    <div className={styles.choices}>
                      {question.choices.map((choice) => (
                        <label key={choice} className={styles.choice}>
                          <input
                            type="radio"
                            name={question.id}
                            checked={answers[question.id] === choice}
                            onChange={() => setAnswers((current) => ({ ...current, [question.id]: choice }))}
                          />
                          <span>{choice}</span>
                        </label>
                      ))}
                    </div>
                    {practiceResult ? (
                      <p className={styles.articleExcerpt} style={{ marginTop: 10 }}>
                        正确答案：{practiceResult.results.find((item) => item.id === question.id)?.correctAnswer}
                        {" · "}
                        {practiceResult.results.find((item) => item.id === question.id)?.explanation}
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>

              <div className={styles.section}>
                <div className={styles.options}>
                  <button type="button" className={styles.secondaryBtn} disabled={busy} onClick={handleGeneratePractice}>
                    重新出题
                  </button>
                  <button type="button" className={styles.primaryBtn} disabled={busy} onClick={handleSubmitPractice}>
                    提交答案
                  </button>
                </div>
              </div>
            </section>
          ) : (
            <section className={`${styles.readerPanel} ${styles.practiceCard}`}>
              <span className={styles.panelTitle}>本文练习</span>
              <p className={styles.empty} style={{ marginTop: 12 }}>
                标注过词条后，可以基于它们快速生成一组词汇练习。
              </p>
              <div className={styles.section}>
                <button
                  type="button"
                  className={styles.primaryBtn}
                  disabled={!activeItem || busy || uniqueVocabCount === 0}
                  onClick={handleGeneratePractice}
                >
                  生成词汇练习
                </button>
              </div>
            </section>
          )}
        </div>

        <CurrentArticleVocab annotations={annotations} onJump={jumpToAnnotation} />
      </div>

      <SelectionPopover
        key={selection ? `${selection.anchorStart}-${selection.anchorEnd}` : "empty-selection"}
        selection={selection}
        onClose={() => setSelection(null)}
        onPick={handleAddAnnotation}
      />
    </main>
  );
}
