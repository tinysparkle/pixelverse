"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { NewsItemSummary, NewsKeywordRecord } from "@/lib/db/types";
import styles from "./news.module.css";

type FilterView = "all" | "unread" | "bookmarked";

function timeAgo(iso: string | null): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}分钟前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}小时前`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}天前`;
  return new Date(iso).toLocaleDateString("zh-CN");
}

export default function NewsPage() {
  const [items, setItems] = useState<NewsItemSummary[]>([]);
  const [keywords, setKeywords] = useState<NewsKeywordRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterView, setFilterView] = useState<FilterView>("all");
  const [activeKeyword, setActiveKeyword] = useState<string | null>(null);
  const [newKeyword, setNewKeyword] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [digestLoading, setDigestLoading] = useState(false);
  const [digest, setDigest] = useState<string | null>(null);
  const [showOriginal, setShowOriginal] = useState<Set<string>>(new Set());
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const PAGE_SIZE = 50;

  const fetchItems = useCallback(
    async (reset = false) => {
      try {
        const params = new URLSearchParams();
        if (activeKeyword) params.set("keyword", activeKeyword);
        if (filterView === "bookmarked") params.set("bookmarked", "true");
        if (filterView === "unread") params.set("unread", "true");
        const currentOffset = reset ? 0 : offset;
        params.set("limit", String(PAGE_SIZE));
        params.set("offset", String(currentOffset));

        const res = await fetch(`/api/news?${params}`);
        if (res.ok) {
          const data: NewsItemSummary[] = await res.json();
          if (reset) {
            setItems(data);
            setOffset(data.length);
          } else {
            setItems((prev) => [...prev, ...data]);
            setOffset(currentOffset + data.length);
          }
          setHasMore(data.length === PAGE_SIZE);
        }
      } finally {
        setLoading(false);
      }
    },
    [activeKeyword, filterView, offset]
  );

  const fetchKeywords = useCallback(async () => {
    const res = await fetch("/api/news/keywords");
    if (res.ok) {
      setKeywords(await res.json());
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    setOffset(0);
    fetchItems(true);
  }, [activeKeyword, filterView]);

  useEffect(() => {
    fetchKeywords();
  }, [fetchKeywords]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await fetch("/api/news/sync", { method: "POST" });
      if (res.ok) {
        setOffset(0);
        await fetchItems(true);
      }
    } finally {
      setSyncing(false);
    }
  };

  const handleDigest = async () => {
    setDigestLoading(true);
    try {
      const res = await fetch("/api/news/digest", { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setDigest(data.digest);
      }
    } finally {
      setDigestLoading(false);
    }
  };

  const handleAddKeyword = async () => {
    const kw = newKeyword.trim();
    if (!kw) return;
    const res = await fetch("/api/news/keywords", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keyword: kw }),
    });
    if (res.ok) {
      setKeywords(await res.json());
      setNewKeyword("");
    }
  };

  const handleDeleteKeyword = async (id: string) => {
    const res = await fetch(`/api/news/keywords/${id}`, { method: "DELETE" });
    if (res.ok) {
      setKeywords((prev) => prev.filter((k) => k.id !== id));
      if (activeKeyword && keywords.find((k) => k.id === id)?.keyword === activeKeyword) {
        setActiveKeyword(null);
      }
    }
  };

  const handleMarkRead = async (newsId: string) => {
    await fetch(`/api/news/${newsId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "read" }),
    });
    setItems((prev) =>
      prev.map((item) => (item.id === newsId ? { ...item, read: true } : item))
    );
  };

  const handleToggleBookmark = async (newsId: string) => {
    const res = await fetch(`/api/news/${newsId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "bookmark" }),
    });
    if (res.ok) {
      const { bookmarked } = await res.json();
      setItems((prev) =>
        prev.map((item) => (item.id === newsId ? { ...item, bookmarked } : item))
      );
    }
  };

  const toggleOriginal = (id: string) => {
    setShowOriginal((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const sources = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of items) {
      map.set(item.source, (map.get(item.source) || 0) + 1);
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [items]);

  const viewCounts = useMemo(() => {
    let unread = 0;
    let bookmarked = 0;
    for (const item of items) {
      if (!item.read) unread++;
      if (item.bookmarked) bookmarked++;
    }
    return { all: items.length, unread, bookmarked };
  }, [items]);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link className={styles.brand} href="/">
          <strong>Pixelverse</strong>
          <span className={styles.brandSep}>/</span>
          <span>AI 资讯</span>
        </Link>
        <nav className={styles.nav}>
          <Link href="/">首页</Link>
          <Link href="/tasks">任务</Link>
          <Link href="/notes">云笔记</Link>
        </nav>
      </header>

      <div className={styles.layout}>
        {/* Sidebar */}
        <aside className={styles.sidebar}>
          <div className={styles.filterGroup}>
            <span className={styles.filterTitle}>视图</span>
            {(["all", "unread", "bookmarked"] as FilterView[]).map((view) => (
              <button
                key={view}
                className={`${styles.filterBtn} ${filterView === view ? styles.filterActive : ""}`}
                onClick={() => setFilterView(view)}
              >
                <span className={styles.filterIcon}>
                  {view === "all" ? "◆" : view === "unread" ? "○" : "★"}
                </span>
                {view === "all" ? "全部" : view === "unread" ? "未读" : "收藏"}
              </button>
            ))}
          </div>

          {/* Keywords */}
          <div className={styles.keywordSection}>
            <span className={styles.filterTitle}>关键词</span>
            <div className={styles.keywordList}>
              {keywords.map((kw) => (
                <span
                  key={kw.id}
                  className={`${styles.keywordTag} ${activeKeyword === kw.keyword ? styles.keywordActive : ""}`}
                  onClick={() =>
                    setActiveKeyword(activeKeyword === kw.keyword ? null : kw.keyword)
                  }
                >
                  {kw.keyword}
                  <span
                    className={styles.keywordRemove}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteKeyword(kw.id);
                    }}
                  >
                    ×
                  </span>
                </span>
              ))}
            </div>
            <div className={styles.keywordAdd}>
              <input
                className={styles.keywordInput}
                placeholder="添加关键词..."
                value={newKeyword}
                onChange={(e) => setNewKeyword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddKeyword()}
              />
              <button className={styles.keywordAddBtn} onClick={handleAddKeyword}>
                +
              </button>
            </div>
          </div>
        </aside>

        {/* Main */}
        <main className={styles.main}>
          <div className={styles.toolbar}>
            <span className={styles.viewTitle}>
              {filterView === "all"
                ? "全部资讯"
                : filterView === "unread"
                  ? "未读"
                  : "收藏"}
              {activeKeyword && ` · ${activeKeyword}`}
            </span>
            <div className={styles.toolbarActions}>
              <button
                className={styles.digestBtn}
                onClick={handleDigest}
                disabled={digestLoading}
              >
                {digestLoading ? "生成中..." : "✦ AI 摘要"}
              </button>
              <button
                className={styles.syncBtn}
                onClick={handleSync}
                disabled={syncing}
              >
                {syncing ? "同步中..." : "⟳ 同步"}
              </button>
            </div>
          </div>

          {/* Digest */}
          {digest && (
            <div className={styles.digestPanel}>
              <div className={styles.digestHeader}>
                <span className={styles.digestLabel}>✦ 每日 AI 摘要</span>
                <button
                  className={styles.digestClose}
                  onClick={() => setDigest(null)}
                >
                  ×
                </button>
              </div>
              <div className={styles.digestContent}>{digest}</div>
            </div>
          )}

          {/* News List */}
          {loading ? (
            <div className={styles.loading}>加载中...</div>
          ) : items.length === 0 ? (
            <div className={styles.empty}>
              <span className={styles.emptyIcon}>◇</span>
              <span className={styles.emptyText}>
                暂无资讯，点击「同步」获取最新数据
              </span>
            </div>
          ) : (
            <>
              <div className={styles.cardList}>
                {items.map((item) => (
                  <article
                    key={item.id}
                    className={`${styles.card} ${item.read ? styles.cardRead : ""}`}
                    onClick={() => handleMarkRead(item.id)}
                  >
                    <div className={styles.cardMeta}>
                      <span className={styles.cardSource}>{item.source}</span>
                      <span className={styles.cardScore}>
                        ★ {item.relevanceScore.toFixed(1)}
                      </span>
                      <span className={styles.cardTime}>
                        {timeAgo(item.publishedAt)}
                      </span>
                    </div>

                    <div className={styles.cardTitle}>
                      {item.titleZh || item.title}
                    </div>
                    {item.titleZh && showOriginal.has(item.id) && (
                      <div className={styles.cardTitleOriginal}>{item.title}</div>
                    )}

                    <div className={styles.cardSummary}>
                      {showOriginal.has(item.id)
                        ? item.summary
                        : item.summaryZh || item.summary}
                    </div>

                    {item.tags.length > 0 && (
                      <div className={styles.cardTags}>
                        {item.tags.map((tag) => (
                          <span key={tag} className={styles.cardTag}>
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}

                    <div className={styles.cardActions}>
                      <button
                        className={`${styles.cardActionBtn} ${item.bookmarked ? styles.bookmarked : ""}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggleBookmark(item.id);
                        }}
                      >
                        {item.bookmarked ? "★ 已收藏" : "☆ 收藏"}
                      </button>
                      {item.titleZh && (
                        <button
                          className={styles.cardActionBtn}
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleOriginal(item.id);
                          }}
                        >
                          {showOriginal.has(item.id) ? "中文" : "原文"}
                        </button>
                      )}
                      <a
                        className={`${styles.cardActionBtn} ${styles.cardLink}`}
                        href={item.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                      >
                        原文 →
                      </a>
                    </div>
                  </article>
                ))}
              </div>

              {hasMore && (
                <div className={styles.loadMore}>
                  <button
                    className={styles.loadMoreBtn}
                    onClick={() => fetchItems(false)}
                  >
                    加载更多
                  </button>
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
