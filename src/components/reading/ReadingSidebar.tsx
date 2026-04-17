"use client";

import type { ReadingItemSummary } from "@/lib/db/types";
import styles from "./reading.module.css";

type TopicPreset = "news" | "science" | "story" | "exam";

const TOPIC_LABELS: Record<TopicPreset, string> = {
  news: "新闻时事",
  science: "科普阅读",
  story: "短篇故事",
  exam: "考试风格",
};

export default function ReadingSidebar({
  items,
  activeItemId,
  busy,
  selectedTopic,
  lengthBucket,
  onTopicChange,
  onLengthChange,
  onGenerate,
  onOpenItem,
}: {
  items: ReadingItemSummary[];
  activeItemId: string | null;
  busy: boolean;
  selectedTopic: TopicPreset;
  lengthBucket: "short" | "medium" | "long";
  onTopicChange: (topic: TopicPreset) => void;
  onLengthChange: (value: "short" | "medium" | "long") => void;
  onGenerate: () => void;
  onOpenItem: (id: string) => void;
}) {
  return (
    <aside className={styles.sidebar}>
      <span className={styles.panelTitle}>阅读工坊</span>

      <div className={styles.section}>
        <label className={styles.muted} htmlFor="reading-topic">
          文章主题
        </label>
        <select
          id="reading-topic"
          className={styles.select}
          value={selectedTopic}
          onChange={(event) => onTopicChange(event.target.value as TopicPreset)}
        >
          {Object.entries(TOPIC_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.section}>
        <span className={styles.muted}>文章篇幅</span>
        <div className={styles.options}>
          {(["short", "medium", "long"] as const).map((value) => (
            <button
              key={value}
              type="button"
              className={value === lengthBucket ? styles.primaryBtn : styles.secondaryBtn}
              onClick={() => onLengthChange(value)}
            >
              {value === "short" ? "短篇" : value === "medium" ? "中篇" : "长篇"}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.section}>
        <button
          type="button"
          className={styles.primaryBtn}
          disabled={busy}
          onClick={onGenerate}
        >
          {busy ? "生成中..." : "生成新文章"}
        </button>
      </div>

      <div className={styles.section}>
        <span className={styles.panelTitle}>文章列表</span>
        <div className={styles.articleList}>
          {items.length === 0 ? (
            <div className={styles.empty}>还没有文章，先生成一篇开始阅读。</div>
          ) : (
            items.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`${styles.articleCard} ${item.id === activeItemId ? styles.articleActive : ""}`}
                onClick={() => onOpenItem(item.id)}
              >
                <span className={styles.articleTitle}>{item.title}</span>
                <span className={styles.articleMeta}>
                  {item.topic} · {item.level.toUpperCase()} · {item.wordCount} 词
                </span>
                <span className={styles.articleExcerpt}>{item.excerpt}</span>
              </button>
            ))
          )}
        </div>
      </div>
    </aside>
  );
}
