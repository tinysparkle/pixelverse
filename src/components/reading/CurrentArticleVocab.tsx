"use client";

import { Volume2, VolumeX } from "lucide-react";
import type { ReadingAnnotationRecord } from "@/lib/db/types";
import styles from "./reading.module.css";

const MASTERY_LABELS = {
  learning: "学习中",
  known: "已掌握",
} as const;

export default function CurrentArticleVocab({
  annotations,
  onJump,
  onPronounce,
  pronunciationSupported,
  speakingText,
}: {
  annotations: ReadingAnnotationRecord[];
  onJump: (annotationId: string) => void;
  onPronounce: (text: string) => void;
  pronunciationSupported: boolean;
  speakingText: string | null;
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
            speechText: annotation.vocabText ?? annotation.selectedText,
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
            <div key={entry.annotationId} className={styles.vocabItemRow}>
              <button
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
                  {entry.masteryState && entry.masteryState in MASTERY_LABELS ? (
                    <span className={`${styles.badge} ${styles.badgeCompact}`}>
                      {MASTERY_LABELS[entry.masteryState as keyof typeof MASTERY_LABELS]}
                    </span>
                  ) : null}
                </span>
              </button>
              <button
                type="button"
                className={`${styles.vocabPronounceBtn} ${speakingText === entry.speechText.trim() ? styles.vocabPronounceBtnActive : ""}`}
                disabled={!pronunciationSupported}
                aria-label={`播放 ${entry.text} 的发音`}
                title={pronunciationSupported ? "播放发音" : "当前浏览器不支持发音"}
                onClick={() => onPronounce(entry.speechText)}
              >
                {speakingText === entry.speechText.trim() ? (
                  <VolumeX size={15} strokeWidth={2.2} />
                ) : (
                  <Volume2 size={15} strokeWidth={2.2} />
                )}
              </button>
            </div>
          ))}
        </div>
      )}
    </aside>
  );
}
