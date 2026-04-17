"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { ReadingReviewCardRecord, ReviewForecast, ReviewGrade } from "@/lib/db/types";
import ReadingHeader from "./ReadingHeader";
import shellStyles from "./reading-shell.module.css";
import styles from "./review-page.module.css";

export default function ReviewPage() {
  const [cards, setCards] = useState<ReadingReviewCardRecord[]>([]);
  const [forecast, setForecast] = useState<ReviewForecast | null>(null);
  const [flipped, setFlipped] = useState(false);
  const [busy, setBusy] = useState(false);

  const loadData = useCallback(async () => {
    const [cardsRes, forecastRes] = await Promise.all([
      fetch("/api/reviews/today"),
      fetch("/api/reviews/preview"),
    ]);

    if (cardsRes.ok) setCards(await cardsRes.json());
    if (forecastRes.ok) setForecast(await forecastRes.json());
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const gradeCurrent = useCallback(async (grade: ReviewGrade) => {
    if (!cards[0]) return;

    setBusy(true);
    try {
      const res = await fetch(`/api/reviews/${cards[0].id}/grade`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ grade }),
      });
      if (!res.ok) return;

      setCards((current) => current.slice(1));
      setFlipped(false);
      await loadData();
    } finally {
      setBusy(false);
    }
  }, [cards, loadData]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (!cards[0] || busy) return;

      if (event.code === "Space") {
        event.preventDefault();
        setFlipped((value) => !value);
      }

      if (!flipped) return;
      if (event.key === "1") gradeCurrent("again");
      if (event.key === "2") gradeCurrent("hard");
      if (event.key === "3") gradeCurrent("good");
      if (event.key === "4") gradeCurrent("easy");
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [cards, flipped, busy, gradeCurrent]);

  const current = cards[0];

  return (
    <main className={shellStyles.page}>
      <ReadingHeader subtitle="今天该看的卡片，会按到期顺序排在这里。" />

      <div className={styles.layout}>
        <section className={styles.stats}>
          <article className={styles.statCard}>
            <p className={styles.muted}>今日到期</p>
            <strong className={styles.statValue}>{cards.length}</strong>
          </article>
          <article className={styles.statCard}>
            <p className={styles.muted}>7 天内</p>
            <strong className={styles.statValue}>{forecast?.within7Days ?? 0}</strong>
          </article>
          <article className={styles.statCard}>
            <p className={styles.muted}>30 天内</p>
            <strong className={styles.statValue}>{forecast?.within30Days ?? 0}</strong>
          </article>
        </section>

        {!current ? (
          <section className={styles.emptyWrap}>
            <h1>今日复习完成</h1>
            <p className={styles.muted}>今天的到期卡片已经处理完了，可以继续去阅读页积累新词。</p>
            <p style={{ marginTop: 16 }}>
              <Link href="/reading">继续阅读训练</Link>
            </p>
          </section>
        ) : (
          <section className={styles.cardWrap}>
            <div className={styles.card}>
              {!flipped ? (
                <div className={styles.cardFront}>
                  <div className={styles.titleRow}>
                    <span className={styles.badge}>{current.vocabKind === "word" ? "生词" : "短语"}</span>
                    <span className={styles.badge}>{current.vocabMasteryState}</span>
                  </div>
                  <h1 className={styles.word}>{current.vocabText}</h1>
                  <p className={styles.muted}>按空格翻面，查看备注与最近上下文。</p>
                </div>
              ) : (
                <div className={styles.cardBack}>
                  <div className={styles.titleRow}>
                    <span className={styles.badge}>备注</span>
                  </div>
                  <p>{current.vocabNoteText || "未填写备注"}</p>
                  <div className={styles.titleRow}>
                    <span className={styles.badge}>最近上下文</span>
                  </div>
                  <p>{current.contextSnippet || "暂无上下文片段"}</p>
                  {current.contextReadingItemId ? (
                    <Link href={`/reading?item=${current.contextReadingItemId}&anchor=${current.contextAnnotationId ?? ""}`}>
                      来自《{current.contextReadingItemTitle ?? "阅读文章"}》
                    </Link>
                  ) : null}
                </div>
              )}
            </div>

            <div className={styles.helper}>
              <span className={styles.muted}>空格翻面，1/2/3/4 快速评分</span>
              <span className={styles.muted}>剩余 {cards.length} 张</span>
            </div>

            <div className={styles.actions}>
              <button type="button" className={`${styles.actionBtn} ${styles.again}`} disabled={!flipped || busy} onClick={() => gradeCurrent("again")}>
                1 Again
              </button>
              <button type="button" className={styles.actionBtn} disabled={!flipped || busy} onClick={() => gradeCurrent("hard")}>
                2 Hard
              </button>
              <button type="button" className={styles.actionBtn} disabled={!flipped || busy} onClick={() => gradeCurrent("good")}>
                3 Good
              </button>
              <button type="button" className={`${styles.actionBtn} ${styles.easy}`} disabled={!flipped || busy} onClick={() => gradeCurrent("easy")}>
                4 Easy
              </button>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
