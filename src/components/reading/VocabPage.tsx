"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { VocabContext, VocabEntryKind, VocabEntryRecord, VocabMasteryState, VocabSummary } from "@/lib/db/types";
import ReadingHeader from "./ReadingHeader";
import shellStyles from "./reading-shell.module.css";
import styles from "./vocab-page.module.css";

type VocabDetail = {
  entry: VocabEntryRecord;
  summary: VocabSummary;
  contexts: VocabContext[];
};

const KIND_TABS: Array<{ label: string; value: "all" | VocabEntryKind }> = [
  { label: "全部", value: "all" },
  { label: "生词", value: "word" },
  { label: "短语", value: "phrase" },
];

const MASTERY_TABS: Array<{ label: string; value: "all" | VocabMasteryState }> = [
  { label: "全部状态", value: "all" },
  { label: "未掌握", value: "new" },
  { label: "学习中", value: "learning" },
  { label: "已掌握", value: "known" },
];

export default function VocabPage() {
  const [items, setItems] = useState<VocabSummary[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [detail, setDetail] = useState<VocabDetail | null>(null);
  const [noteText, setNoteText] = useState("");
  const [query, setQuery] = useState("");
  const [kindFilter, setKindFilter] = useState<"all" | VocabEntryKind>("all");
  const [masteryFilter, setMasteryFilter] = useState<"all" | VocabMasteryState>("all");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (kindFilter !== "all") params.set("kind", kindFilter);
      if (masteryFilter !== "all") params.set("mastery", masteryFilter);
      if (query.trim()) params.set("q", query.trim());

      const res = await fetch(`/api/vocab?${params.toString()}`);
      if (!res.ok) return;

      const data: VocabSummary[] = await res.json();
      setItems(data);
      if (!data.length) {
        setActiveId(null);
        setDetail(null);
        return;
      }

      if (!activeId || !data.some((item) => item.id === activeId)) {
        setActiveId(data[0].id);
      }
    } finally {
      setLoading(false);
    }
  }, [activeId, kindFilter, masteryFilter, query]);

  const fetchDetail = useCallback(async (id: string) => {
    const res = await fetch(`/api/vocab/${id}`);
    if (!res.ok) return;
    const data: VocabDetail = await res.json();
    setDetail(data);
    setNoteText(data.entry.noteText ?? "");
  }, []);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  useEffect(() => {
    if (!activeId) return;
    fetchDetail(activeId);
  }, [activeId, fetchDetail]);

  async function saveDetail(updates: { noteText?: string | null; masteryState?: VocabMasteryState }) {
    if (!detail) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/vocab/${detail.entry.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (!res.ok) return;
      const updated: VocabEntryRecord = await res.json();
      setDetail((current) => current ? {
        ...current,
        entry: updated,
        summary: {
          ...current.summary,
          noteText: updated.noteText,
          masteryState: updated.masteryState,
          updatedAt: updated.updatedAt,
        },
      } : current);
      setItems((current) => current.map((item) => item.id === updated.id ? {
        ...item,
        noteText: updated.noteText,
        masteryState: updated.masteryState,
        updatedAt: updated.updatedAt,
      } : item));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!detail || !window.confirm(`确认删除词条“${detail.entry.text}”吗？`)) return;

    const res = await fetch(`/api/vocab/${detail.entry.id}`, { method: "DELETE" });
    if (!res.ok) return;

    setDetail(null);
    setItems((current) => current.filter((item) => item.id !== detail.entry.id));
    setActiveId((current) => (current === detail.entry.id ? null : current));
  }

  return (
    <main className={shellStyles.page}>
      <ReadingHeader subtitle="跨文章聚合你的生词与短语，统一整理和回顾。" />

      <div className={styles.layout}>
        <section className={styles.listPanel}>
          <div className={styles.filters}>
            <input
              className={styles.search}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索词条或备注"
            />

            <div className={styles.tabs}>
              {KIND_TABS.map((tab) => (
                <button
                  key={tab.value}
                  type="button"
                  className={`${styles.tab} ${kindFilter === tab.value ? styles.tabActive : ""}`}
                  onClick={() => setKindFilter(tab.value)}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className={styles.tabs}>
              {MASTERY_TABS.map((tab) => (
                <button
                  key={tab.value}
                  type="button"
                  className={`${styles.tab} ${masteryFilter === tab.value ? styles.tabActive : ""}`}
                  onClick={() => setMasteryFilter(tab.value)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.list}>
            {loading ? (
              <p className={styles.muted}>正在加载词条...</p>
            ) : items.length === 0 ? (
              <p className={styles.empty}>还没有词条。先去阅读页标注一些生词吧。</p>
            ) : (
              items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`${styles.item} ${activeId === item.id ? styles.itemActive : ""}`}
                  onClick={() => setActiveId(item.id)}
                >
                  <div className={styles.row}>
                    <strong>{item.text}</strong>
                    {item.glossCn ? <span className={styles.badge}>{item.glossCn}</span> : null}
                    <span className={styles.badge}>{item.kind === "word" ? "生词" : "短语"}</span>
                    <span className={styles.badge}>{item.masteryState}</span>
                  </div>
                  <div className={styles.metaRow}>
                    <span className={styles.muted}>{item.articleCount} 篇文章</span>
                    <span className={styles.muted}>{item.occurrenceCount} 次命中</span>
                  </div>
                  <p className={styles.contextText}>{item.noteText || "未写备注"}</p>
                </button>
              ))
            )}
          </div>
        </section>

        <section className={styles.detailPanel}>
          {!detail ? (
            <p className={styles.empty}>从左侧选择一个词条，查看上下文与学习状态。</p>
          ) : (
            <>
              <div className={styles.row}>
                <h1 className={styles.detailTitle}>{detail.entry.text}</h1>
                {detail.entry.glossCn ? <span className={styles.badge}>{detail.entry.glossCn}</span> : null}
                <span className={styles.badge}>{detail.entry.kind === "word" ? "生词" : "短语"}</span>
                <span className={styles.badge}>{detail.entry.masteryState}</span>
              </div>

              <p className={styles.muted}>
                出现在 {detail.summary.articleCount} 篇文章中，共 {detail.summary.occurrenceCount} 次命中。
              </p>

              <div className={styles.section}>
                <span className={styles.muted}>备注</span>
                <textarea
                  className={styles.textarea}
                  value={noteText}
                  onChange={(event) => setNoteText(event.target.value)}
                  placeholder="写一点自己的记忆提示、联想或辨析"
                />
                <div className={styles.buttonRow}>
                  <button
                    type="button"
                    className={styles.primaryBtn}
                    disabled={saving}
                    onClick={() => saveDetail({ noteText: noteText.trim() || null })}
                  >
                    保存备注
                  </button>
                  <button
                    type="button"
                    className={styles.secondaryBtn}
                    disabled={saving}
                    onClick={() => saveDetail({ masteryState: "new" })}
                  >
                    标记未掌握
                  </button>
                  <button
                    type="button"
                    className={styles.secondaryBtn}
                    disabled={saving}
                    onClick={() => saveDetail({ masteryState: "learning" })}
                  >
                    标记学习中
                  </button>
                  <button
                    type="button"
                    className={styles.secondaryBtn}
                    disabled={saving}
                    onClick={() => saveDetail({ masteryState: "known" })}
                  >
                    标记已掌握
                  </button>
                  <button type="button" className={styles.dangerBtn} disabled={saving} onClick={handleDelete}>
                    删除词条
                  </button>
                </div>
              </div>

              <div className={styles.section}>
                <span className={styles.muted}>上下文</span>
                <div className={styles.contexts}>
                  {detail.contexts.map((context) => (
                    <article key={context.annotationId} className={styles.contextCard}>
                      <strong>{context.readingItemTitle}</strong>
                      <p className={styles.contextText}>{context.snippet}</p>
                      <Link href={`/reading?item=${context.readingItemId}&anchor=${context.annotationId}`}>
                        回到文章定位
                      </Link>
                    </article>
                  ))}
                </div>
              </div>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
