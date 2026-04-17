"use client";

import type { ReadingAnnotationRecord } from "@/lib/db/types";
import styles from "./reading.module.css";

export default function CurrentArticleVocab({
  annotations,
  onJump,
}: {
  annotations: ReadingAnnotationRecord[];
  onJump: (annotationId: string) => void;
}) {
  const vocabEntries = Array.from(
    new Map(
      annotations
        .filter((annotation) => annotation.vocabEntryId && annotation.vocabKind)
        .map((annotation) => [
          annotation.vocabEntryId,
          {
            annotationId: annotation.id,
            text: annotation.vocabText ?? annotation.selectedText,
            glossCn: annotation.vocabGlossCn,
            kind: annotation.vocabKind!,
            masteryState: annotation.vocabMasteryState,
          },
        ])
    ).values()
  );

  return (
    <aside className={styles.aside}>
      <span className={styles.panelTitle}>本文词条</span>
      {vocabEntries.length === 0 ? (
        <div className={styles.section}>
          <p className={styles.empty}>选中单词或短语后，它们会汇总到这里。</p>
        </div>
      ) : (
        <div className={styles.vocabList}>
          {vocabEntries.map((entry) => (
            <button
              key={entry.annotationId}
              type="button"
              className={styles.vocabItem}
              onClick={() => onJump(entry.annotationId)}
            >
              <span className={styles.vocabItemBody}>
                <span className={styles.vocabWord}>{entry.text}</span>
                {entry.glossCn ? <span className={styles.vocabGloss}>{entry.glossCn}</span> : null}
              </span>
              <span className={styles.vocabItemBadges} aria-hidden>
                <span className={`${styles.badge} ${styles.badgeCompact} ${entry.kind === "word" ? styles.badgeWord : styles.badgePhrase}`}>
                  {entry.kind === "word" ? "生词" : "短语"}
                </span>
                {entry.masteryState ? (
                  <span className={`${styles.badge} ${styles.badgeCompact}`}>{entry.masteryState}</span>
                ) : null}
              </span>
            </button>
          ))}
        </div>
      )}
    </aside>
  );
}
