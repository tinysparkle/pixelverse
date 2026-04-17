"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type {
  ReadingAnnotationRecord,
  ReadingItemRecord,
  ReadingItemSummary,
} from "@/lib/db/types";
import ArticleReader from "./ArticleReader";
import CurrentArticleVocab from "./CurrentArticleVocab";
import ReadingHeader from "./ReadingHeader";
import ReadingSidebar from "./ReadingSidebar";
import SelectionPopover, { type ReadingSelectionPayload } from "./SelectionPopover";
import shellStyles from "./reading-shell.module.css";
import styles from "./reading.module.css";

type TopicPreset = "news" | "science" | "story" | "exam";

export default function ReadingPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedItemId = searchParams.get("item");
  const requestedAnchorId = searchParams.get("anchor");

  const [items, setItems] = useState<ReadingItemSummary[]>([]);
  const [activeItem, setActiveItem] = useState<ReadingItemRecord | null>(null);
  const [annotations, setAnnotations] = useState<ReadingAnnotationRecord[]>([]);
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

  async function handleRemoveAnnotation() {
    if (!activeItem || !selection || selection.mode !== "remove") return;

    const { annotationId } = selection;
    const itemId = activeItem.id;
    setSelection(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/reading/${itemId}/annotations/${annotationId}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatusMessage(typeof data.error === "string" ? data.error : "移除标注失败。");
        return;
      }

      setAnnotations((current) => current.filter((a) => a.id !== annotationId));
      setStatusMessage("已移除该处标注与高亮。");
    } finally {
      setBusy(false);
    }
  }

  async function handleAddAnnotation(kind: "word" | "phrase") {
    if (!activeItem || !selection || selection.mode === "remove") return;

    const pendingSelection = selection;
    const itemId = activeItem.id;
    setSelection(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/reading/${itemId}/annotations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          selectedText: pendingSelection.text,
          anchorStart: pendingSelection.anchorStart,
          anchorEnd: pendingSelection.anchorEnd,
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

      if (!data.vocabGlossCn) {
        const annotationId = data.id as string;
        let tries = 0;
        const poll = window.setInterval(async () => {
          tries += 1;
          const fresh = await loadAnnotations(itemId);
          const got = fresh.find((a) => a.id === annotationId)?.vocabGlossCn;
          if (got || tries >= 6) {
            window.clearInterval(poll);
          }
        }, 1200);
      }
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
        </div>

        <CurrentArticleVocab annotations={annotations} onJump={jumpToAnnotation} />
      </div>

      <SelectionPopover
        key={
          selection
            ? `${selection.anchorStart}-${selection.anchorEnd}-${selection.mode === "remove" ? selection.annotationId : "add"}`
            : "empty-selection"
        }
        selection={selection}
        onClose={() => setSelection(null)}
        onPick={handleAddAnnotation}
        onRemoveAnnotation={handleRemoveAnnotation}
      />
    </main>
  );
}
