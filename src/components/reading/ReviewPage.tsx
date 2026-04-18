"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { ReadingStudyCard, ReviewForecast, ReviewGrade } from "@/lib/db/types";
import ReadingHeader from "./ReadingHeader";
import shellStyles from "./reading-shell.module.css";
import styles from "./review-page.module.css";

const GRADE_ACTIONS: Array<{ grade: ReviewGrade; label: string; hotkey: string; tone?: "danger" | "safe" }> = [
  { grade: "again", label: "再记一遍", hotkey: "1", tone: "danger" },
  { grade: "hard", label: "有点难", hotkey: "2" },
  { grade: "good", label: "记住了", hotkey: "3" },
  { grade: "easy", label: "很轻松", hotkey: "4", tone: "safe" },
];

export default function ReviewPage() {
  const [cards, setCards] = useState<ReadingStudyCard[]>([]);
  const [forecast, setForecast] = useState<ReviewForecast | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [showContext, setShowContext] = useState(false);
  const dismissedCardIdsRef = useRef<Set<string>>(new Set());

  const loadCards = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/reviews/cards", { cache: "no-store" });
      if (!res.ok) return;

      const data = await res.json();
      const nextCards = Array.isArray(data.cards)
        ? data.cards.filter((card: ReadingStudyCard) => !dismissedCardIdsRef.current.has(card.id))
        : [];
      setCards(nextCards);
      setForecast(data.forecast ?? null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCards();
  }, [loadCards]);

  const current = cards[0] ?? null;
  const remainingCount = cards.length;
  const dueCount = useMemo(() => cards.filter((card) => card.isDue).length, [cards]);

  useEffect(() => {
    setShowContext(false);
  }, [current?.id]);

  const gradeCurrent = useCallback(async (grade: ReviewGrade) => {
    if (!current) return;

    setBusy(true);
    try {
      const res = await fetch(`/api/reviews/${current.id}/grade`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ grade }),
      });
      if (!res.ok) return;

      await res.json();
      dismissedCardIdsRef.current.add(current.id);
      setCards((currentCards) => currentCards.filter((card) => card.id !== current.id));
      setShowContext(false);
      void loadCards();
    } finally {
      setBusy(false);
    }
  }, [current, loadCards]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (!current || busy) return;

      if (event.key === "1") {
        event.preventDefault();
        void gradeCurrent("again");
      }
      if (event.key === "2") {
        event.preventDefault();
        void gradeCurrent("hard");
      }
      if (event.key === "3") {
        event.preventDefault();
        void gradeCurrent("good");
      }
      if (event.key === "4") {
        event.preventDefault();
        void gradeCurrent("easy");
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [busy, current, gradeCurrent]);

  return (
    <main className={`${shellStyles.page} ${styles.page}`}>
      <ReadingHeader subtitle="进入页面后直接刷卡，键盘 1/2/3/4 可快速推进。" />

      <div className={styles.viewport}>
        <section className={styles.topbar}>
          <article className={styles.statCard}>
            <p className={styles.statLabel}>本轮剩余</p>
            <strong className={styles.statValue}>{remainingCount}</strong>
          </article>
          <article className={styles.statCard}>
            <p className={styles.statLabel}>现在该复习</p>
            <strong className={styles.statValue}>{dueCount}</strong>
          </article>
          <article className={styles.statCard}>
            <p className={styles.statLabel}>7天内 / 30天内</p>
            <strong className={styles.statValue}>
              {forecast?.within7Days ?? 0} / {forecast?.within30Days ?? 0}
            </strong>
          </article>
        </section>

        {loading ? (
          <section className={styles.emptyWrap}>
            <p className={styles.muted}>正在加载单词卡片...</p>
          </section>
        ) : !current ? (
          <section className={styles.emptyWrap}>
            <h1>今日卡片已刷完</h1>
            <p className={styles.muted}>今天的待刷卡片已经处理完了，可以继续去阅读页积累新词。</p>
            <p style={{ marginTop: 16 }}>
              <Link href="/reading">继续阅读训练</Link>
            </p>
          </section>
        ) : (
          <section className={styles.cardShell}>
            <article className={styles.card}>
              <header className={styles.cardHeader}>
                <div className={styles.badgeRow}>
                  <span className={styles.badge}>{current.vocabKind === "word" ? "生词" : "短语"}</span>
                  <span className={`${styles.badge} ${current.isDue ? styles.badgeDue : styles.badgeFuture}`}>
                    {current.isDue ? "已到期" : "待复习"}
                  </span>
                </div>
                <p className={styles.dueText}>
                  下次复习：{new Date(current.dueAt).toLocaleString("zh-CN", { hour12: false })}
                </p>
              </header>

              <div className={styles.wordBlock}>
                <h1 className={styles.word}>{current.vocabText}</h1>
                <p className={styles.gloss}>{current.vocabGlossCn || "暂未生成中文释义"}</p>
              </div>

              <button
                type="button"
                className={styles.contextToggle}
                onClick={() => setShowContext((value) => !value)}
              >
                {showContext ? "收起上下文" : "查看上下文"}
              </button>

              {showContext ? (
                <section className={styles.contextSection}>
                  <p className={styles.contextText}>{current.contextSnippet || "暂无上下文片段"}</p>
                  {current.contextReadingItemId ? (
                    <Link
                      className={styles.contextLink}
                      href={`/reading?item=${current.contextReadingItemId}&anchor=${current.contextAnnotationId ?? ""}`}
                    >
                      返回《{current.contextReadingItemTitle ?? "阅读文章"}》
                    </Link>
                  ) : null}
                </section>
              ) : null}

              <div className={styles.reviewActions}>
                {GRADE_ACTIONS.map((action) => (
                  <button
                    key={action.grade}
                    type="button"
                    className={`${styles.reviewBtn} ${action.tone === "danger" ? styles.reviewBtnDanger : ""} ${action.tone === "safe" ? styles.reviewBtnSafe : ""}`}
                    disabled={busy}
                    onClick={() => void gradeCurrent(action.grade)}
                  >
                    <span className={styles.reviewHotkey}>{action.hotkey}</span>
                    <span>{action.label}</span>
                  </button>
                ))}
              </div>
            </article>
          </section>
        )}
      </div>
    </main>
  );
}
