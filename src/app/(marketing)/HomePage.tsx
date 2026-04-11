"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import PixelCat from "@/components/pet/PixelCat";
import styles from "./home.module.css";

export default function HomePage({
  isAuthenticated,
}: {
  isAuthenticated: boolean;
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
          <a href="#modules">模块</a>
          <a href="#about">关于</a>
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
            <span className={styles.heroLine}>嘿，</span>
            <span className={styles.heroLine}>欢迎来到我的站。</span>
          </h1>
          <p>
            这里是我的数字角落。记笔记、理思路、追进度 ——
            一个安静的地方，慢慢长出自己的形状。
          </p>
          <div className={styles.actions}>
            <Link className={styles.button} href={isAuthenticated ? "/notes" : "/login"}>
              {isAuthenticated ? "继续云笔记" : "登录后进入"}
              <span className={styles.buttonArrow}>→</span>
            </Link>
            <a className={`${styles.button} ${styles.subtle}`} href="#about">
              了解更多
            </a>
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

      <section className={styles.section} id="modules">
        <div className={styles.sectionHead}>
          <div>
            <span className={styles.sectionLabel}>Modules</span>
            <h2>正在搭建中的小工具</h2>
          </div>
          <p>一个个来，不急。</p>
        </div>
        <div className={styles.cards}>
          {[
            {
              num: "01",
              code: "Cloud Notes",
              title: "云笔记",
              desc: "随手记录想法，富文本编辑，自动保存。已上线，可以试试。",
              tags: ["已上线", "核心模块"],
              live: true,
            },
            {
              num: "02",
              code: "Task Queue",
              title: "待办列表",
              desc: "轻量的任务管理，帮自己理清每天要做的事。",
              tags: ["开发中", "下一个"],
              live: false,
            },
            {
              num: "03",
              code: "Hot Radar",
              title: "热点雷达",
              desc: "订阅感兴趣的信息源，自动汇总推送给自己。",
              tags: ["规划中", "稍后"],
              live: false,
            },
          ].map((card, idx) => (
            <article
              key={card.num}
              className={`${styles.card} ${card.live ? styles.cardLive : ""}`}
              style={{ animationDelay: `${0.1 + idx * 0.08}s` }}
            >
              <div className={styles.cardHead}>
                <span className={styles.cardLabel}>{card.num} / {card.code}</span>
                {card.live && <span className={styles.cardPulse} />}
              </div>
              <h3>{card.title}</h3>
              <p>{card.desc}</p>
              <div className={styles.cardTags}>
                {card.tags.map((t) => (
                  <span key={t}>{t}</span>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.about} id="about">
        <div className={styles.aboutCopy}>
          <span className={styles.sectionLabel}>About</span>
          <h2>一个会慢慢长大的个人站</h2>
          <p>
            从一个简单的首页开始，每次多做一点。
            不追求一步到位，只要方向对就好。
          </p>
        </div>
        <aside className={styles.nowCard}>
          <strong>Now</strong>
          <p>打磨云笔记体验。</p>
          <div className={styles.nowPulse} aria-hidden="true" />
        </aside>
      </section>

      <footer className={styles.footer}>
        <span className={styles.footerNote}>Pixelverse / 像素宇宙</span>
        <span className={styles.time}>{clock}</span>
      </footer>

      {/* 像素小猫 - 在屏幕边缘走动 */}
      <PixelCat />
    </main>
  );
}
