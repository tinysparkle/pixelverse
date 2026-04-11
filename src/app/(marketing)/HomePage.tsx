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

  useEffect(() => {
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
    <main className={styles.page}>
      <header className={styles.header}>
        <Link className={styles.brand} href="/">
          <strong>Pixelverse</strong>
          <span>像素宇宙</span>
        </Link>
        <nav className={styles.nav}>
          <Link href="/">首页</Link>
          <a href="#modules">模块</a>
          <a href="#about">关于</a>
          <Link className={styles.navAccent} href={isAuthenticated ? "/notes" : "/login"}>
            {isAuthenticated ? "云笔记" : "登入"}
          </Link>
        </nav>
      </header>

      <section className={styles.hero} id="home">
        <div className={styles.heroCopy}>
          <span className={styles.tag}>Pixelverse / 创意工坊</span>
          <h1>嘿，<br />欢迎来到我的站。</h1>
          <p>
            这里是我的数字角落。记笔记、理思路、追进度 ——
            一个安静的地方，慢慢长出自己的形状。
          </p>
          <div className={styles.actions}>
            <Link className={styles.button} href={isAuthenticated ? "/notes" : "/login"}>
              {isAuthenticated ? "继续云笔记" : "登录后进入"}
            </Link>
            <a className={`${styles.button} ${styles.subtle}`} href="#about">
              了解更多
            </a>
          </div>
        </div>
      </section>

      <section className={styles.section} id="modules">
        <div className={styles.sectionHead}>
          <h2>正在搭建中的小工具</h2>
          <p>一个个来，不急。</p>
        </div>
        <div className={styles.cards}>
          <article className={styles.card}>
            <span className={styles.cardLabel}>01 / Cloud Notes</span>
            <h3>云笔记</h3>
            <p>随手记录想法，富文本编辑，自动保存。已上线，可以试试。</p>
            <div className={styles.cardTags}>
              <span>已上线</span>
              <span>核心模块</span>
            </div>
          </article>
          <article className={styles.card}>
            <span className={styles.cardLabel}>02 / Task Queue</span>
            <h3>待办列表</h3>
            <p>轻量的任务管理，帮自己理清每天要做的事。</p>
            <div className={styles.cardTags}>
              <span>开发中</span>
              <span>下一个</span>
            </div>
          </article>
          <article className={styles.card}>
            <span className={styles.cardLabel}>03 / Hot Radar</span>
            <h3>热点雷达</h3>
            <p>订阅感兴趣的信息源，自动汇总推送给自己。</p>
            <div className={styles.cardTags}>
              <span>规划中</span>
              <span>稍后</span>
            </div>
          </article>
        </div>
      </section>

      <section className={styles.about} id="about">
        <div className={styles.aboutCopy}>
          <h2>一个会慢慢长大的个人站</h2>
          <p>
            从一个简单的首页开始，每次多做一点。
            不追求一步到位，只要方向对就好。
          </p>
        </div>
        <aside className={styles.nowCard}>
          <strong>Now</strong>
          <p>打磨云笔记体验。</p>
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
