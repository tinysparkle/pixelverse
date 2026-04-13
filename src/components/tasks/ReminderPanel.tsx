"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { TaskSummary } from "@/lib/db/types";
import styles from "./reminder.module.css";

const STORAGE_KEY = "pixelverse_reminder_days";
const DEFAULT_DAYS = 7;

function getDaysUntil(dueDate: string | null): number | null {
  if (!dueDate) return null;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const due = new Date(dueDate);
  due.setHours(0, 0, 0, 0);
  return Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function formatDueShort(dueDate: string | null): string {
  const days = getDaysUntil(dueDate);
  if (days === null) return "";
  if (days < 0) return `过期${Math.abs(days)}天`;
  if (days === 0) return "今天";
  if (days === 1) return "明天";
  return `${days}天后`;
}

export default function ReminderPanel({
  initialTasks,
}: {
  initialTasks: TaskSummary[];
}) {
  const [open, setOpen] = useState(false);
  const [tasks, setTasks] = useState(initialTasks);
  const [days, setDays] = useState(DEFAULT_DAYS);
  const [showSettings, setShowSettings] = useState(false);

  // 从 localStorage 读取提醒阈值
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const n = Number(saved);
      if (n >= 1 && n <= 90) setDays(n);
    }
  }, []);

  // 当 days 变化时重新拉取
  useEffect(() => {
    async function refetch() {
      const res = await fetch(`/api/tasks/upcoming?days=${days}`);
      if (res.ok) setTasks(await res.json());
    }
    refetch();
  }, [days]);

  function handleDaysChange(newDays: number) {
    const clamped = Math.max(1, Math.min(90, newDays));
    setDays(clamped);
    localStorage.setItem(STORAGE_KEY, String(clamped));
  }

  if (tasks.length === 0) return null;

  return (
    <div className={`${styles.panel} ${open ? styles.panelOpen : ""}`}>
      {/* 收起时的触发按钮 */}
      <button
        className={styles.trigger}
        onClick={() => setOpen(!open)}
        aria-label="待办提醒"
      >
        <svg className={styles.triggerIcon} width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <rect x="6" y="1" width="4" height="1" />
          <rect x="4" y="2" width="8" height="1" />
          <rect x="3" y="3" width="10" height="1" />
          <rect x="3" y="4" width="10" height="1" />
          <rect x="3" y="5" width="10" height="1" />
          <rect x="3" y="6" width="10" height="1" />
          <rect x="2" y="7" width="12" height="1" />
          <rect x="2" y="8" width="12" height="1" />
          <rect x="1" y="9" width="14" height="1" />
          <rect x="1" y="10" width="14" height="1" />
          <rect x="0" y="11" width="16" height="1" />
          <rect x="6" y="12" width="4" height="1" />
          <rect x="7" y="13" width="2" height="1" />
        </svg>
        <span className={styles.badge}>{tasks.length}</span>
      </button>

      {/* 展开的面板 */}
      {open && (
        <div className={styles.dropdown}>
          <div className={styles.dropdownHeader}>
            <span className={styles.dropdownTitle}>即将到期</span>
            <div className={styles.dropdownActions}>
              <button
                className={styles.settingsBtn}
                onClick={() => setShowSettings(!showSettings)}
                title="提醒设置"
              >
                ⚙
              </button>
              <button
                className={styles.closeBtn}
                onClick={() => setOpen(false)}
              >
                ✕
              </button>
            </div>
          </div>

          {showSettings && (
            <div className={styles.settings}>
              <label className={styles.settingsLabel}>
                提前提醒天数
              </label>
              <input
                className={styles.settingsInput}
                type="number"
                min={1}
                max={90}
                value={days}
                onChange={(e) => handleDaysChange(Number(e.target.value))}
              />
            </div>
          )}

          <ul className={styles.list}>
            {tasks.map((task) => {
              const d = getDaysUntil(task.dueDate);
              const isOverdue = d !== null && d < 0;

              return (
                <li key={task.id} className={styles.item}>
                  <span
                    className={`${styles.dot} ${styles[`dot_${task.priority}`]}`}
                  />
                  <div className={styles.itemContent}>
                    <span className={styles.itemTitle}>{task.title}</span>
                    <span
                      className={`${styles.itemDue} ${isOverdue ? styles.itemDueOverdue : ""}`}
                    >
                      {formatDueShort(task.dueDate)}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>

          <Link href="/tasks" className={styles.viewAll}>
            查看全部任务 →
          </Link>
        </div>
      )}
    </div>
  );
}
