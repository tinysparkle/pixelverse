"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import PixelCat from "@/components/pet/PixelCat";
import ReminderPanel from "@/components/tasks/ReminderPanel";
import type { TaskSummary } from "@/lib/db/types";
import styles from "./home.module.css";

export default function HomePage({
  isAuthenticated,
  upcomingTasks = [],
}: {
  isAuthenticated: boolean;
  upcomingTasks?: TaskSummary[];
}) {
  const [clock, setClock] = useState("");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const tick = () => {
      const now = new Date();
      const stamp = [
        now.getFullYear(),
        String(now.getMonth() + 1).padStart(2, "0"),
        String(now.getDate()).padStart(2, "0"),
      ].join(".");
      const time = [
        String(now.getHours()).padStart(2, "0"),
        String(now.getMinutes()).padStart(2, "0"),
      ].join(":");
      setClock(`${stamp} ${time}`);
    };
    tick();
    const id = setInterval(tick, 30000);
    return () => clearInterval(id);
  }, []);

  return (
    <main className={`${styles.page} ${mounted ? styles.entered : ""}`}>
      {/* Decorative pixel corner accents */}
      <div className={styles.cornerTL} aria-hidden="true" />
      <div className={styles.cornerBR} aria-hidden="true" />

      <header className={styles.header}>
        <Link className={styles.brand} href="/">
          <strong>Pixelverse</strong>
          <span className={styles.brandSep}>/</span>
          <span>像素宇宙</span>
        </Link>
        <nav className={styles.nav}>
          <Link href="/">首页</Link>
          {isAuthenticated && <Link href="/tasks">任务</Link>}
          {isAuthenticated && <Link href="/news">资讯</Link>}
          <Link className={styles.navAccent} href={isAuthenticated ? "/notes" : "/login"}>
            <span className={styles.navDot} />
            {isAuthenticated ? "云笔记" : "登入"}
          </Link>
        </nav>
      </header>

      <section className={styles.hero} id="home">
        <div className={styles.heroCopy}>
          <span className={styles.tag}>
            <span className={styles.tagDot} />
            Pixelverse / 创意工坊
          </span>
          <h1>
            <span className={styles.heroLine}>探索，</span>
            <span className={styles.heroLine}>从这里开始。</span>
          </h1>
          <p>一个安静的数字角落，慢慢长出自己的形状。</p>
          <div className={styles.actions}>
            <Link className={styles.button} href={isAuthenticated ? "/notes" : "/login"}>
              {isAuthenticated ? "继续云笔记" : "登录后进入"}
              <span className={styles.buttonArrow}>→</span>
            </Link>
          </div>
        </div>
        <div className={styles.heroDecor} aria-hidden="true">
          <div className={styles.heroGlyphGrid}>
            {Array.from({ length: 9 }, (_, i) => (
              <span key={i} className={styles.heroGlyph}>
                {["◆", "◇", "■", "□", "▲", "△", "●", "○", "✦"][i]}
              </span>
            ))}
          </div>
        </div>
      </section>

      <footer className={styles.footer}>
        <span className={styles.footerNote}>Pixelverse / 像素宇宙</span>
        <span className={styles.time}>{clock}</span>
      </footer>

      {/* 即将到期的任务提醒 */}
      {isAuthenticated && upcomingTasks.length > 0 && (
        <ReminderPanel initialTasks={upcomingTasks} />
      )}

      {/* 像素小猫 - 在屏幕边缘走动 */}
      <PixelCat />
    </main>
  );
}
