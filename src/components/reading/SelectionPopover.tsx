"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import styles from "./reading.module.css";

export interface ReadingSelectionPayload {
  text: string;
  anchorStart: number;
  anchorEnd: number;
  rect: DOMRect;
}

export default function SelectionPopover({
  selection,
  onClose,
  onPick,
}: {
  selection: ReadingSelectionPayload | null;
  onClose: () => void;
  onPick: (kind: "word" | "phrase", noteText?: string | null) => void;
}) {
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const [showNote, setShowNote] = useState(false);
  const [noteText, setNoteText] = useState("");
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
  }, [selection, showNote]);

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

  return createPortal(
    <div
      ref={popoverRef}
      className={styles.popover}
      style={{ position: "fixed", left: position.left, top: position.top, zIndex: 40 }}
    >
      <div className={styles.popoverText}>{selection.text}</div>
      <div className={styles.popoverActions}>
        <button type="button" className={styles.secondaryBtn} onClick={() => onPick("word", noteText || null)}>
          加入生词
        </button>
        <button type="button" className={styles.secondaryBtn} onClick={() => onPick("phrase", noteText || null)}>
          加入短语
        </button>
        <button type="button" className={styles.ghostBtn} onClick={() => setShowNote((value) => !value)}>
          写备注
        </button>
      </div>
      {showNote ? (
        <div className={styles.section}>
          <textarea
            className={styles.textarea}
            value={noteText}
            onChange={(event) => setNoteText(event.target.value)}
            placeholder="给这个词条写一点自己的记忆提示"
          />
        </div>
      ) : null}
    </div>,
    document.body
  );
}
