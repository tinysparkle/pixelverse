"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";
import { Volume2, VolumeX } from "lucide-react";
import type { ReadingTermInsight } from "@/lib/db/types";
import styles from "./reading.module.css";

export type ReadingSelectionPayload =
  | {
      text: string;
      anchorStart: number;
      anchorEnd: number;
      rect: DOMRect;
      mode?: "add";
    }
  | {
      text: string;
      anchorStart: number;
      anchorEnd: number;
      rect: DOMRect;
      mode: "remove";
      annotationId: string;
    };

export type SelectionInsightStatus = "idle" | "loading" | "resolved" | "error" | "unsupported";

export default function SelectionPopover({
  selection,
  onClose,
  onPick,
  onPronounce,
  onRemoveAnnotation,
  onResolveInsight,
  pronunciationSupported,
  pronunciationBusy,
  insight,
  insightStatus,
  insightMessage,
}: {
  selection: ReadingSelectionPayload | null;
  onClose: () => void;
  onPick: (kind: "word" | "phrase") => void;
  onPronounce: (text: string) => void;
  onRemoveAnnotation?: () => void;
  onResolveInsight?: () => void;
  pronunciationSupported: boolean;
  pronunciationBusy: boolean;
  insight: ReadingTermInsight | null;
  insightStatus: SelectionInsightStatus;
  insightMessage: string | null;
}) {
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState({ left: 12, top: 12 });

  useLayoutEffect(() => {
    if (!selection || !popoverRef.current) return;

    const bounds = popoverRef.current.getBoundingClientRect();
    let top = selection.rect.top - bounds.height - 12;
    if (top < 12) {
      top = selection.rect.bottom + 12;
    }

    let left = selection.rect.left + selection.rect.width / 2 - bounds.width / 2;
    left = Math.max(12, Math.min(left, window.innerWidth - bounds.width - 12));
    setPosition({ left, top });
  }, [selection]);

  useEffect(() => {
    if (!selection) return;

    function handlePointerDown(event: globalThis.PointerEvent | TouchEvent) {
      if (!popoverRef.current?.contains(event.target as Node)) {
        onClose();
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("touchstart", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("touchstart", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [selection, onClose]);

  useEffect(() => {
    if (!selection || !onResolveInsight) return;
    onResolveInsight();
  }, [selection, onResolveInsight]);

  if (typeof document === "undefined" || !selection) return null;

  const isRemove = selection.mode === "remove";
  const preventButtonFocus = (
    event: ReactPointerEvent<HTMLButtonElement> | ReactMouseEvent<HTMLButtonElement>
  ) => {
    event.preventDefault();
  };

  return createPortal(
    <div
      ref={popoverRef}
      className={styles.popover}
      style={{ position: "fixed", left: position.left, top: position.top, zIndex: 40 }}
    >
      <div className={styles.popoverHeader}>
        <div className={styles.popoverText}>{selection.text}</div>
        <button
          type="button"
          className={styles.popoverPronounceBtn}
          disabled={!pronunciationSupported}
          onPointerDown={preventButtonFocus}
          onMouseDown={preventButtonFocus}
          onClick={() => onPronounce(selection.text)}
          title={pronunciationSupported ? "播放发音" : "当前浏览器不支持发音"}
        >
          {pronunciationBusy ? <VolumeX size={15} strokeWidth={2} /> : <Volume2 size={15} strokeWidth={2} />}
          <span>{pronunciationBusy ? "播放中" : "播放发音"}</span>
        </button>
      </div>
      {insightStatus === "loading" ? (
        <div className={styles.insightCard}>
          <div className={styles.insightLoadingRow}>
            <span className={styles.insightSkeletonWide} />
            <span className={styles.insightSkeletonShort} />
          </div>
          <div className={styles.insightLoadingRow}>
            <span className={styles.insightSkeletonTag} />
            <span className={styles.insightSkeletonTag} />
            <span className={styles.insightSkeletonTag} />
          </div>
          <div className={styles.insightSkeletonBlock} />
          <div className={styles.insightSkeletonBlock} />
        </div>
      ) : null}
      {insightStatus === "resolved" && insight ? (
        <div className={styles.insightCard}>
          <div className={styles.insightTopRow}>
            <strong className={styles.insightGloss}>{insight.glossCn}</strong>
            <span className={styles.insightMeta}>{insight.partOfSpeech || insight.detectedKind}</span>
          </div>
          {insight.phonetic ? <p className={styles.insightPhonetic}>{insight.phonetic}</p> : null}
          {insight.grammarTags.length ? (
            <div className={styles.insightTags}>
              {insight.grammarTags.map((tag) => (
                <span key={tag} className={styles.insightTag}>{tag}</span>
              ))}
            </div>
          ) : null}
          {insight.definitionEn ? <p className={styles.insightDefinition}>{insight.definitionEn}</p> : null}
          {insight.exampleEn ? (
            <div className={styles.insightExample}>
              <p>{insight.exampleEn}</p>
              {insight.exampleCn ? <p className={styles.insightExampleCn}>{insight.exampleCn}</p> : null}
            </div>
          ) : null}
        </div>
      ) : null}
      {(insightStatus === "error" || insightStatus === "unsupported") && insightMessage ? (
        <div className={styles.insightMessage}>{insightMessage}</div>
      ) : null}
      <div className={styles.popoverActions}>
        {isRemove ? (
          <>
            <button
              type="button"
              className={styles.secondaryBtn}
              onPointerDown={preventButtonFocus}
              onMouseDown={preventButtonFocus}
              onClick={() => {
                onRemoveAnnotation?.();
              }}
            >
              移除标注
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className={styles.secondaryBtn}
              onPointerDown={preventButtonFocus}
              onMouseDown={preventButtonFocus}
              onClick={() => onPick("word")}
            >
              加入生词
            </button>
            <button
              type="button"
              className={styles.secondaryBtn}
              onPointerDown={preventButtonFocus}
              onMouseDown={preventButtonFocus}
              onClick={() => onPick("phrase")}
            >
              加入短语
            </button>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}
