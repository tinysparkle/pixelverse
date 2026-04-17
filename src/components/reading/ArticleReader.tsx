"use client";

import { useEffect, useMemo, useRef, type ReactNode } from "react";
import type { ReadingAnnotationRecord, ReadingItemRecord } from "@/lib/db/types";
import type { ReadingSelectionPayload } from "./SelectionPopover";
import styles from "./reading.module.css";

function getParagraphRanges(contentText: string) {
  const regex = /[^\n]+(?:\n(?!\n)[^\n]+)*/g;
  const paragraphs: Array<{ text: string; start: number; end: number }> = [];
  let match: RegExpExecArray | null;

  while ((match = regex.exec(contentText)) !== null) {
    paragraphs.push({
      text: match[0],
      start: match.index,
      end: match.index + match[0].length,
    });
  }

  return paragraphs;
}

function getMarkClass(kind: ReadingAnnotationRecord["kind"]) {
  if (kind === "word") return `${styles.mark} ${styles.wordMark}`;
  return `${styles.mark} ${styles.phraseMark}`;
}

function findOffsetHost(node: Node | null) {
  if (!node) return null;
  if (node instanceof HTMLElement) return node.closest<HTMLElement>("[data-offset]");
  return node.parentElement?.closest<HTMLElement>("[data-offset]") ?? null;
}

export default function ArticleReader({
  item,
  annotations,
  focusAnnotationId,
  onSelectionChange,
}: {
  item: ReadingItemRecord | null;
  annotations: ReadingAnnotationRecord[];
  focusAnnotationId: string | null;
  onSelectionChange: (payload: ReadingSelectionPayload | null) => void;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const selectionTimerRef = useRef<number | null>(null);

  const paragraphs = useMemo(() => {
    if (!item) return [];
    return getParagraphRanges(item.contentText);
  }, [item]);

  function handleSelection() {
    const root = rootRef.current;
    const selection = window.getSelection();
    if (!root || !selection || selection.rangeCount === 0 || selection.isCollapsed) {
      onSelectionChange(null);
      return;
    }

    const range = selection.getRangeAt(0);
    if (!root.contains(range.commonAncestorContainer)) {
      onSelectionChange(null);
      return;
    }

    const startHost = findOffsetHost(range.startContainer);
    const endHost = findOffsetHost(range.endContainer);
    if (!startHost || !endHost) {
      onSelectionChange(null);
      return;
    }

    const baseStart = Number(startHost.dataset.offset ?? "");
    const baseEnd = Number(endHost.dataset.offset ?? "");
    if (!Number.isFinite(baseStart) || !Number.isFinite(baseEnd)) {
      onSelectionChange(null);
      return;
    }

    const anchorStart = baseStart + range.startOffset;
    const anchorEnd = baseEnd + range.endOffset;
    if (anchorEnd <= anchorStart || !item) {
      onSelectionChange(null);
      return;
    }

    const text = item.contentText.slice(anchorStart, anchorEnd);
    const rect = range.getBoundingClientRect();
    if (!text.trim() || (!rect.width && !rect.height)) {
      onSelectionChange(null);
      return;
    }

    const exactMatch = annotations.find(
      (annotation) => annotation.anchorStart === anchorStart && annotation.anchorEnd === anchorEnd
    );
    if (exactMatch) {
      onSelectionChange({
        text,
        anchorStart,
        anchorEnd,
        rect,
        mode: "remove",
        annotationId: exactMatch.id,
      });
      return;
    }

    onSelectionChange({
      text,
      anchorStart,
      anchorEnd,
      rect,
      mode: "add",
    });
  }

  function scheduleSelectionUpdate(delay = 0) {
    if (selectionTimerRef.current !== null) {
      window.clearTimeout(selectionTimerRef.current);
    }

    selectionTimerRef.current = window.setTimeout(() => {
      selectionTimerRef.current = null;
      handleSelection();
    }, delay);
  }

  useEffect(() => {
    function handleDocumentSelectionChange() {
      scheduleSelectionUpdate(20);
    }

    document.addEventListener("selectionchange", handleDocumentSelectionChange);
    return () => {
      document.removeEventListener("selectionchange", handleDocumentSelectionChange);
      if (selectionTimerRef.current !== null) {
        window.clearTimeout(selectionTimerRef.current);
      }
    };
  });

  if (!item) {
    return (
      <section className={styles.readerPanel}>
        <p className={styles.empty}>左侧生成一篇文章，或者点开已有文章开始阅读。</p>
      </section>
    );
  }

  return (
    <section className={styles.readerPanel}>
      <div className={styles.articleWrap}>
        <header className={styles.articleHeader}>
          <span className={styles.panelTitle}>沉浸阅读</span>
          <h1 className={styles.articleHeading}>{item.title}</h1>
          <p className={styles.statusText}>
            {item.topic} · {item.level.toUpperCase()} · {item.wordCount} 词
          </p>
        </header>

        <div
          ref={rootRef}
          className={styles.articleBody}
          onMouseUp={handleSelection}
          onPointerUp={() => scheduleSelectionUpdate(0)}
          onTouchEnd={() => scheduleSelectionUpdate(60)}
          onKeyUp={handleSelection}
          onContextMenu={(event) => event.preventDefault()}
        >
          {paragraphs.map((paragraph) => {
            const relevant = annotations
              .filter((annotation) => annotation.anchorEnd > paragraph.start && annotation.anchorStart < paragraph.end)
              .sort((left, right) => left.anchorStart - right.anchorStart);

            const nodes: ReactNode[] = [];
            let cursor = 0;

            relevant.forEach((annotation) => {
              const relativeStart = Math.max(0, annotation.anchorStart - paragraph.start);
              const relativeEnd = Math.min(paragraph.text.length, annotation.anchorEnd - paragraph.start);
              if (relativeEnd <= cursor || relativeEnd <= relativeStart) return;

              if (relativeStart > cursor) {
                const chunk = paragraph.text.slice(cursor, relativeStart);
                nodes.push(
                  <span
                    key={`${paragraph.start}-${cursor}`}
                    className={styles.textChunk}
                    data-offset={paragraph.start + cursor}
                  >
                    {chunk}
                  </span>
                );
              }

              const markText = paragraph.text.slice(relativeStart, relativeEnd);
              nodes.push(
                <span
                  key={annotation.id}
                  className={`${getMarkClass(annotation.kind)} ${focusAnnotationId === annotation.id ? styles.focusMark : ""}`}
                  data-offset={annotation.anchorStart}
                  data-annotation-id={annotation.id}
                  data-gloss={annotation.vocabGlossCn ?? undefined}
                >
                  {annotation.vocabGlossCn ? (
                    <span className={styles.glossText}>{annotation.vocabGlossCn}</span>
                  ) : null}
                  {markText}
                </span>
              );
              cursor = relativeEnd;
            });

            if (cursor < paragraph.text.length) {
              nodes.push(
                <span
                  key={`${paragraph.start}-${cursor}-tail`}
                  className={styles.textChunk}
                  data-offset={paragraph.start + cursor}
                >
                  {paragraph.text.slice(cursor)}
                </span>
              );
            }

            return (
              <p key={`${paragraph.start}-${paragraph.end}`} className={styles.paragraph}>
                {nodes}
              </p>
            );
          })}
        </div>
      </div>
    </section>
  );
}
