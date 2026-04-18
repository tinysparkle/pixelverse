"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type {
  ReadingAnnotationRecord,
  ReadingItemRecord,
  ReadingItemSummary,
  ReadingTermInsight,
} from "@/lib/db/types";
import ArticleReader from "./ArticleReader";
import CurrentArticleVocab from "./CurrentArticleVocab";
import ReadingHeader from "./ReadingHeader";
import ReadingSidebar from "./ReadingSidebar";
import SelectionPopover, { type ReadingSelectionPayload, type SelectionInsightStatus } from "./SelectionPopover";
import shellStyles from "./reading-shell.module.css";
import styles from "./reading.module.css";
import { usePronunciation } from "./usePronunciation";
import { normalizeSelectedText, normalizeVocabText } from "./readingUtils";

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
  const [selectionInsight, setSelectionInsight] = useState<ReadingTermInsight | null>(null);
  const [selectionInsightStatus, setSelectionInsightStatus] = useState<SelectionInsightStatus>("idle");
  const [selectionInsightMessage, setSelectionInsightMessage] = useState<string | null>(null);
  const [focusAnnotationId, setFocusAnnotationId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState("选中文本后可以直接加入生词或短语。");
  const { speak, stop, supported, speakingText } = usePronunciation();
  const activeItemIdRef = useRef<string | null>(null);
  const desiredItemIdRef = useRef<string | null>(null);
  const openRequestSeqRef = useRef(0);
  const itemAbortRef = useRef<AbortController | null>(null);
  const annotationsAbortRef = useRef<AbortController | null>(null);
  const selectionInsightCacheRef = useRef(new Map<string, ReadingTermInsight>());
  const inFlightInsightsRef = useRef(new Map<string, Promise<ReadingTermInsight | null>>());
  const lastRequestedInsightKeyRef = useRef<string | null>(null);

  useEffect(() => {
    activeItemIdRef.current = activeItem?.id ?? null;
  }, [activeItem?.id]);

  const restoreScrollPosition = useCallback((scrollX: number, scrollY: number) => {
    window.requestAnimationFrame(() => {
      window.scrollTo(scrollX, scrollY);
    });
  }, []);

  useEffect(() => {
    return () => {
      itemAbortRef.current?.abort();
      annotationsAbortRef.current?.abort();
      stop();
    };
  }, [stop]);

  useEffect(() => {
    stop();
  }, [activeItem?.id, stop]);

  useEffect(() => {
    selectionInsightCacheRef.current.clear();
    inFlightInsightsRef.current.clear();
    lastRequestedInsightKeyRef.current = null;
    setSelectionInsight(null);
    setSelectionInsightStatus("idle");
    setSelectionInsightMessage(null);
  }, [activeItem?.id]);

  useEffect(() => {
    if (selection) return;
    lastRequestedInsightKeyRef.current = null;
    setSelectionInsight(null);
    setSelectionInsightStatus("idle");
    setSelectionInsightMessage(null);
  }, [selection]);

  const replaceReadingParams = useCallback((updates: { item?: string | null; anchor?: string | null }) => {
    const nextParams = new URLSearchParams(window.location.search);

    if (updates.item !== undefined) {
      if (updates.item) {
        nextParams.set("item", updates.item);
      } else {
        nextParams.delete("item");
      }
    }

    if (updates.anchor !== undefined) {
      if (updates.anchor) {
        nextParams.set("anchor", updates.anchor);
      } else {
        nextParams.delete("anchor");
      }
    }

    const nextQuery = nextParams.toString();
    const nextUrl = nextQuery ? `/reading?${nextQuery}` : "/reading";
    const currentUrl = `${window.location.pathname}${window.location.search}`;
    if (nextUrl !== currentUrl) {
      router.replace(nextUrl, { scroll: false });
    }
  }, [router]);

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

  const loadAnnotations = useCallback(async (itemId: string, signal?: AbortSignal) => {
    const res = await fetch(`/api/reading/${itemId}/annotations`, { signal });
    if (!res.ok) return [];
    const data: ReadingAnnotationRecord[] = await res.json();
    setAnnotations(data);
    return data;
  }, []);

  const openItem = useCallback(async (itemId: string, syncUrl = true) => {
    desiredItemIdRef.current = itemId;

    if (syncUrl) {
      replaceReadingParams({ item: itemId, anchor: null });
    }

    if (activeItemIdRef.current === itemId) {
      return;
    }

    const requestSeq = openRequestSeqRef.current + 1;
    openRequestSeqRef.current = requestSeq;
    itemAbortRef.current?.abort();
    annotationsAbortRef.current?.abort();
    const itemController = new AbortController();
    const annotationsController = new AbortController();
    itemAbortRef.current = itemController;
    annotationsAbortRef.current = annotationsController;

    try {
      const itemRes = await fetch(`/api/reading/${itemId}`, { signal: itemController.signal });
      if (!itemRes.ok) return;

      const item: ReadingItemRecord = await itemRes.json();
      if (openRequestSeqRef.current !== requestSeq || desiredItemIdRef.current !== itemId) {
        return;
      }

      activeItemIdRef.current = item.id;
      setActiveItem(item);
      setSelection(null);
      await loadAnnotations(itemId, annotationsController.signal);
      if (openRequestSeqRef.current !== requestSeq || desiredItemIdRef.current !== itemId) {
        return;
      }
      if (syncUrl) {
        replaceReadingParams({ item: itemId, anchor: null });
      }
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        throw error;
      }
    } finally {
      if (itemAbortRef.current === itemController) {
        itemAbortRef.current = null;
      }
      if (annotationsAbortRef.current === annotationsController) {
        annotationsAbortRef.current = null;
      }
    }
  }, [loadAnnotations, replaceReadingParams]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  useEffect(() => {
    if (!items.length) return;

    if (requestedItemId) {
      if (requestedItemId !== desiredItemIdRef.current) {
        void openItem(requestedItemId, false);
      }
      return;
    }

    const fallbackItemId = items[0]?.id;
    if (fallbackItemId && fallbackItemId !== desiredItemIdRef.current) {
      void openItem(fallbackItemId, true);
    }
  }, [items, requestedItemId, openItem]);

  const jumpToAnnotation = useCallback((annotationId: string) => {
    setFocusAnnotationId(annotationId);
    const target = document.querySelector<HTMLElement>(`[data-annotation-id="${annotationId}"]`);
    target?.scrollIntoView({ behavior: "smooth", block: "center" });

    replaceReadingParams({ item: activeItem?.id ?? null, anchor: annotationId });

    window.setTimeout(() => setFocusAnnotationId((value) => (value === annotationId ? null : value)), 1400);
  }, [activeItem?.id, replaceReadingParams]);

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
        keepalive: true,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topicPreset: selectedTopic,
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
        await openItem(data.item.id, true);
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleRemoveAnnotation() {
    if (!activeItem || !selection || selection.mode !== "remove") return;

    const { annotationId } = selection;
    const itemId = activeItem.id;
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;
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
      restoreScrollPosition(scrollX, scrollY);
    } finally {
      setBusy(false);
    }
  }

  async function handleAddAnnotation(kind: "word" | "phrase") {
    if (!activeItem || !selection || selection.mode === "remove") return;

    const pendingSelection = selection;
    const itemId = activeItem.id;
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;
    const pendingInsight = selectionInsight;
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
          insight: pendingInsight ? {
            glossCn: pendingInsight.glossCn,
            phonetic: pendingInsight.phonetic,
            partOfSpeech: pendingInsight.partOfSpeech,
            grammarTags: pendingInsight.grammarTags,
            definitionEn: pendingInsight.definitionEn,
            exampleEn: pendingInsight.exampleEn,
            exampleCn: pendingInsight.exampleCn,
          } : null,
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
      restoreScrollPosition(scrollX, scrollY);
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

  const resolveSelectionInsight = useCallback(() => {
    if (!selection || !activeItem) {
      setSelectionInsight(null);
      setSelectionInsightStatus("idle");
      setSelectionInsightMessage(null);
      return () => {};
    }

    const normalizedSelection = normalizeSelectedText(selection.text);
    const normalizedText = normalizeVocabText(normalizedSelection);
    let cancelled = false;
    if (!normalizedText) {
      setSelectionInsight(null);
      setSelectionInsightStatus("error");
      setSelectionInsightMessage("划词内容无效");
      return () => {
        cancelled = true;
      };
    }

    if (normalizedSelection.length > 80 || normalizedSelection.split(/\s+/).filter(Boolean).length > 6) {
      setSelectionInsight(null);
      setSelectionInsightStatus("unsupported");
      setSelectionInsightMessage("仅支持单词或短语");
      lastRequestedInsightKeyRef.current = `${activeItem.id}:${selection.anchorStart}:${selection.anchorEnd}:${normalizedText}:unsupported`;
      return () => {
        cancelled = true;
      };
    }

    const annotation = selection.mode === "remove"
      ? annotations.find((item) => item.id === selection.annotationId)
      : null;

    if (annotation?.vocabGlossCn) {
      setSelectionInsight({
        id: annotation.vocabEntryId ?? `${activeItem.id}-${selection.anchorStart}-${selection.anchorEnd}`,
        userId: activeItem.userId,
        text: annotation.vocabText ?? annotation.selectedText,
        normalizedText,
        detectedKind: annotation.kind,
        glossCn: annotation.vocabGlossCn,
        phonetic: annotation.vocabPhonetic,
        partOfSpeech: annotation.vocabPartOfSpeech,
        grammarTags: annotation.vocabGrammarTags,
        definitionEn: annotation.vocabDefinitionEn,
        exampleEn: annotation.vocabExampleEn,
        exampleCn: annotation.vocabExampleCn,
        sourceSentence: null,
        createdAt: annotation.createdAt,
        updatedAt: annotation.createdAt,
        fromCache: true,
      });
      setSelectionInsightStatus("resolved");
      setSelectionInsightMessage(null);
      lastRequestedInsightKeyRef.current = `${activeItem.id}:${selection.anchorStart}:${selection.anchorEnd}:${normalizedText}:annotation`;
      return () => {
        cancelled = true;
      };
    }

    if (selection.mode === "remove") {
      setSelectionInsight(null);
      setSelectionInsightStatus("idle");
      setSelectionInsightMessage(null);
      return () => {
        cancelled = true;
      };
    }

    const cacheKey = `${activeItem.id}:${selection.anchorStart}:${selection.anchorEnd}:${normalizedText}`;
    if (lastRequestedInsightKeyRef.current === cacheKey) {
      return () => {
        cancelled = true;
      };
    }

    const cached = selectionInsightCacheRef.current.get(cacheKey);
    if (cached) {
      lastRequestedInsightKeyRef.current = cacheKey;
      setSelectionInsight(cached);
      setSelectionInsightStatus("resolved");
      setSelectionInsightMessage(null);
      return () => {
        cancelled = true;
      };
    }

    setSelectionInsight(null);
    setSelectionInsightStatus("loading");
    setSelectionInsightMessage(null);
    lastRequestedInsightKeyRef.current = cacheKey;

    const existingPromise = inFlightInsightsRef.current.get(cacheKey);
    const requestPromise = existingPromise ?? (async () => {
      const res = await fetch(`/api/reading/${activeItem.id}/insights`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          selectedText: selection.text,
          anchorStart: selection.anchorStart,
          anchorEnd: selection.anchorEnd,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof data.error === "string" ? data.error : "分析失败");
      }

      return data as ReadingTermInsight;
    })();

    if (!existingPromise) {
      inFlightInsightsRef.current.set(cacheKey, requestPromise);
    }

    requestPromise
      .then((data) => {
        if (cancelled) return;
        selectionInsightCacheRef.current.set(cacheKey, data);
        setSelectionInsight(data);
        setSelectionInsightStatus("resolved");
        setSelectionInsightMessage(null);
      })
      .catch((error) => {
        if (cancelled) return;
        setSelectionInsight(null);
        setSelectionInsightStatus(error instanceof Error && error.message === "仅支持单词或短语" ? "unsupported" : "error");
        setSelectionInsightMessage(error instanceof Error ? error.message : "分析失败");
      })
      .finally(() => {
        inFlightInsightsRef.current.delete(cacheKey);
      });

    return () => {
      cancelled = true;
    };
  }, [activeItem, annotations, selection]);

  useEffect(() => {
    if (!selection) return;
    return resolveSelectionInsight();
  }, [selection, resolveSelectionInsight]);

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
            onPronounce={speak}
            pronunciationSupported={supported}
            speakingText={speakingText}
          />
        </div>

        <CurrentArticleVocab
          annotations={annotations}
          onJump={jumpToAnnotation}
          onPronounce={speak}
          pronunciationSupported={supported}
          speakingText={speakingText}
        />
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
        onPronounce={speak}
        onRemoveAnnotation={handleRemoveAnnotation}
        pronunciationSupported={supported}
        pronunciationBusy={speakingText === selection?.text.trim()}
        insight={selectionInsight}
        insightStatus={selectionInsightStatus}
        insightMessage={selectionInsightMessage}
        onResolveInsight={resolveSelectionInsight}
      />
    </main>
  );
}
