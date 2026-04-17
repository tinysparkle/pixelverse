"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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

export default function SelectionPopover({
  selection,
  onClose,
  onPick,
  onRemoveAnnotation,
}: {
  selection: ReadingSelectionPayload | null;
  onClose: () => void;
  onPick: (kind: "word" | "phrase") => void;
  onRemoveAnnotation?: () => void;
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

    function handlePointerDown(event: MouseEvent) {
      if (!popoverRef.current?.contains(event.target as Node)) {
        onClose();
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [selection, onClose]);

  if (typeof document === "undefined" || !selection) return null;

  const isRemove = selection.mode === "remove";

  return createPortal(
    <div
      ref={popoverRef}
      className={styles.popover}
      style={{ position: "fixed", left: position.left, top: position.top, zIndex: 40 }}
    >
      <div className={styles.popoverText}>{selection.text}</div>
      <div className={styles.popoverActions}>
        {isRemove ? (
          <button
            type="button"
            className={styles.secondaryBtn}
            onClick={() => {
              onRemoveAnnotation?.();
            }}
          >
            移除标注
          </button>
        ) : (
          <>
            <button type="button" className={styles.secondaryBtn} onClick={() => onPick("word")}>
              加入生词
            </button>
            <button type="button" className={styles.secondaryBtn} onClick={() => onPick("phrase")}>
              加入短语
            </button>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}
