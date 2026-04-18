"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { TaskPriority, TaskRecord, TaskSummary } from "@/lib/db/types";
import styles from "./tasks.module.css";

type FilterView = "all" | "today" | "upcoming" | "completed";

const PRIORITY_LABELS: Record<TaskPriority, string> = {
  high: "高",
  medium: "中",
  low: "低",
};

function getDaysUntil(dueDate: string | null): number | null {
  if (!dueDate) return null;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const due = new Date(dueDate);
  due.setHours(0, 0, 0, 0);
  return Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function formatDueLabel(dueDate: string | null): string {
  const days = getDaysUntil(dueDate);
  if (days === null) return "";
  if (days < 0) return `已过期 ${Math.abs(days)} 天`;
  if (days === 0) return "今天到期";
  if (days === 1) return "明天到��";
  return `${days} 天后`;
}

function formatDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function TasksPage() {
  const [tasks, setTasks] = useState<TaskSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterView, setFilterView] = useState<FilterView>("all");
  const [filterTag, setFilterTag] = useState<string | null>(null);

  // 新建/编辑 表单状态
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formTitle, setFormTitle] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formDueDate, setFormDueDate] = useState("");
  const [formPriority, setFormPriority] = useState<TaskPriority>("medium");
  const [formTags, setFormTags] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchTasks = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (filterTag) params.set("tag", filterTag);
      const res = await fetch(`/api/tasks?${params}`);
      if (res.ok) {
        setTasks(await res.json());
      }
    } finally {
      setLoading(false);
    }
  }, [filterTag]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  // 从任务列表中提取所有标签
  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const t of tasks) {
      for (const tag of t.tags) set.add(tag);
    }
    return Array.from(set).sort();
  }, [tasks]);

  // 根据视图筛选
  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      if (filterView === "completed") return t.completedAt !== null;
      if (filterView === "today") {
        if (t.completedAt) return false;
        const days = getDaysUntil(t.dueDate);
        return days !== null && days <= 0;
      }
      if (filterView === "upcoming") {
        if (t.completedAt) return false;
        const days = getDaysUntil(t.dueDate);
        return days !== null && days >= 0 && days <= 7;
      }
      // "all" — 显示未完成的
      return t.completedAt === null;
    });
  }, [tasks, filterView]);

  function resetForm() {
    setFormTitle("");
    setFormDescription("");
    setFormDueDate("");
    setFormPriority("medium");
    setFormTags("");
    setEditingId(null);
    setFormOpen(false);
  }

  function openNewForm() {
    resetForm();
    setFormOpen(true);
  }

  async function openEditForm(id: string) {
    const res = await fetch(`/api/tasks/${id}`);
    if (!res.ok) return;
    const task: TaskRecord = await res.json();
    setEditingId(task.id);
    setFormTitle(task.title);
    setFormDescription(task.description ?? "");
    setFormDueDate(task.dueDate ? formatDate(task.dueDate) : "");
    setFormPriority(task.priority);
    setFormTags(task.tags.join(", "));
    setFormOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formTitle.trim() || saving) return;

    setSaving(true);
    try {
      const body = {
        title: formTitle.trim(),
        description: formDescription.trim() || null,
        dueDate: formDueDate || null,
        priority: formPriority,
        tags: formTags
          .split(/[,，]/)
          .map((t) => t.trim())
          .filter(Boolean),
      };

      if (editingId) {
        await fetch(`/api/tasks/${editingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      } else {
        await fetch("/api/tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      }

      resetForm();
      fetchTasks();
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(id: string) {
    await fetch(`/api/tasks/${id}/toggle`, { method: "POST" });
    fetchTasks();
  }

  async function handleDelete(id: string) {
    await fetch(`/api/tasks/${id}`, { method: "DELETE" });
    fetchTasks();
  }

  const filterCounts = useMemo(() => {
    const pending = tasks.filter((t) => !t.completedAt);
    const today = pending.filter((t) => {
      const d = getDaysUntil(t.dueDate);
      return d !== null && d <= 0;
    });
    const upcoming = pending.filter((t) => {
      const d = getDaysUntil(t.dueDate);
      return d !== null && d >= 0 && d <= 7;
    });
    const completed = tasks.filter((t) => t.completedAt);
    return {
      all: pending.length,
      today: today.length,
      upcoming: upcoming.length,
      completed: completed.length,
    };
  }, [tasks]);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link className={styles.brand} href="/">
          <strong>Pixelverse</strong>
          <span className={styles.brandSep}>/</span>
          <span>任务队列</span>
        </Link>
        <nav className={styles.nav}>
          <Link href="/">首页</Link>
          <Link href="/notes">云笔记</Link>
          <Link href="/reading">阅读训练</Link>
          <Link href="/reading/review">单词卡片</Link>
        </nav>
      </header>

      <div className={styles.layout}>
        {/* 左侧筛选栏 */}
        <aside className={styles.sidebar}>
          <div className={styles.filterGroup}>
            <h3 className={styles.filterTitle}>视图</h3>
            {(["all", "today", "upcoming", "completed"] as FilterView[]).map(
              (view) => (
                <button
                  key={view}
                  className={`${styles.filterBtn} ${filterView === view ? styles.filterActive : ""}`}
                  onClick={() => setFilterView(view)}
                >
                  <span className={styles.filterIcon}>
                    {view === "all" && "■"}
                    {view === "today" && "▲"}
                    {view === "upcoming" && "◆"}
                    {view === "completed" && "●"}
                  </span>
                  <span>
                    {view === "all" && "待办"}
                    {view === "today" && "今天"}
                    {view === "upcoming" && "即将"}
                    {view === "completed" && "已完成"}
                  </span>
                  <span className={styles.filterCount}>
                    {filterCounts[view]}
                  </span>
                </button>
              )
            )}
          </div>

          {allTags.length > 0 && (
            <div className={styles.filterGroup}>
              <h3 className={styles.filterTitle}>标签</h3>
              <button
                className={`${styles.filterBtn} ${filterTag === null ? styles.filterActive : ""}`}
                onClick={() => setFilterTag(null)}
              >
                <span className={styles.filterIcon}>○</span>
                <span>全部标签</span>
              </button>
              {allTags.map((tag) => (
                <button
                  key={tag}
                  className={`${styles.filterBtn} ${filterTag === tag ? styles.filterActive : ""}`}
                  onClick={() => setFilterTag(tag)}
                >
                  <span className={styles.filterIcon}>#</span>
                  <span>{tag}</span>
                </button>
              ))}
            </div>
          )}
        </aside>

        {/* 右侧主区域 */}
        <main className={styles.main}>
          <div className={styles.toolbar}>
            <h2 className={styles.viewTitle}>
              {filterView === "all" && "待办事项"}
              {filterView === "today" && "今日到期"}
              {filterView === "upcoming" && "即将到期"}
              {filterView === "completed" && "已完成"}
            </h2>
            <button className={styles.addBtn} onClick={openNewForm}>
              + 新建任务
            </button>
          </div>

          {/* 新建/编辑 表单 */}
          {formOpen && (
            <form className={styles.form} onSubmit={handleSubmit}>
              <div className={styles.formHeader}>
                <span className={styles.formLabel}>
                  {editingId ? "编辑任务" : "新建任务"}
                </span>
                <button
                  type="button"
                  className={styles.formClose}
                  onClick={resetForm}
                >
                  ✕
                </button>
              </div>

              <input
                className={styles.formInput}
                type="text"
                placeholder="任务标题"
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                autoFocus
              />

              <textarea
                className={styles.formTextarea}
                placeholder="描述（可选）"
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                rows={2}
              />

              <div className={styles.formRow}>
                <div className={styles.formField}>
                  <label className={styles.formFieldLabel}>截止日期</label>
                  <input
                    className={styles.formInput}
                    type="date"
                    value={formDueDate}
                    onChange={(e) => setFormDueDate(e.target.value)}
                  />
                </div>

                <div className={styles.formField}>
                  <label className={styles.formFieldLabel}>优先级</label>
                  <select
                    className={styles.formSelect}
                    value={formPriority}
                    onChange={(e) =>
                      setFormPriority(e.target.value as TaskPriority)
                    }
                  >
                    <option value="high">高</option>
                    <option value="medium">中</option>
                    <option value="low">低</option>
                  </select>
                </div>

                <div className={styles.formField}>
                  <label className={styles.formFieldLabel}>标签</label>
                  <input
                    className={styles.formInput}
                    type="text"
                    placeholder="用逗号分隔"
                    value={formTags}
                    onChange={(e) => setFormTags(e.target.value)}
                  />
                </div>
              </div>

              <div className={styles.formActions}>
                <button
                  type="button"
                  className={styles.cancelBtn}
                  onClick={resetForm}
                >
                  取消
                </button>
                <button
                  type="submit"
                  className={styles.submitBtn}
                  disabled={!formTitle.trim() || saving}
                >
                  {saving ? "保存中..." : editingId ? "更新" : "创建"}
                </button>
              </div>
            </form>
          )}

          {/* 任务列表 */}
          {loading ? (
            <div className={styles.empty}>加载中...</div>
          ) : filteredTasks.length === 0 ? (
            <div className={styles.empty}>
              {filterView === "all"
                ? "暂无待办事项，点击「新建任务」开始"
                : "暂无匹配的任务"}
            </div>
          ) : (
            <ul className={styles.taskList}>
              {filteredTasks.map((task) => {
                const days = getDaysUntil(task.dueDate);
                const isOverdue =
                  days !== null && days < 0 && !task.completedAt;

                return (
                  <li
                    key={task.id}
                    className={`${styles.taskItem} ${task.completedAt ? styles.taskCompleted : ""} ${isOverdue ? styles.taskOverdue : ""}`}
                  >
                    <button
                      className={styles.checkbox}
                      onClick={() => handleToggle(task.id)}
                      aria-label={
                        task.completedAt ? "标记为未完成" : "标记为已完成"
                      }
                    >
                      {task.completedAt ? "☑" : "☐"}
                    </button>

                    <div className={styles.taskContent}>
                      <div className={styles.taskTitleRow}>
                        <span className={styles.taskTitle}>{task.title}</span>
                        <span
                          className={`${styles.priorityDot} ${styles[`priority_${task.priority}`]}`}
                          title={`优先级: ${PRIORITY_LABELS[task.priority]}`}
                        />
                      </div>

                      <div className={styles.taskMeta}>
                        {task.dueDate && (
                          <span
                            className={`${styles.dueLabel} ${isOverdue ? styles.dueLabelOverdue : ""}`}
                          >
                            {formatDueLabel(task.dueDate)}
                          </span>
                        )}
                        {task.tags.map((tag) => (
                          <span
                            key={tag}
                            className={styles.tag}
                            onClick={() => setFilterTag(tag)}
                          >
                            #{tag}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className={styles.taskActions}>
                      <button
                        className={styles.actionBtn}
                        onClick={() => openEditForm(task.id)}
                        title="编辑"
                      >
                        ✎
                      </button>
                      <button
                        className={styles.actionBtn}
                        onClick={() => handleDelete(task.id)}
                        title="删除"
                      >
                        ✕
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </main>
      </div>
    </div>
  );
}
