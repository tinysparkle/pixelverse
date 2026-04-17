"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./reading-shell.module.css";

const TABS = [
  { href: "/reading", label: "阅读训练" },
  { href: "/reading/vocab", label: "我的生词本" },
  { href: "/reading/review", label: "今日复习" },
];

export default function ReadingHeader({
  subtitle,
}: {
  subtitle?: string;
}) {
  const pathname = usePathname();

  return (
    <header className={styles.header}>
      <div className={styles.brandWrap}>
        <Link className={styles.brand} href="/reading">
          <span>Pixelverse</span>
          <span className={styles.brandSep}>/</span>
          <span>Reading Studio</span>
        </Link>
        <span className={styles.meta}>{subtitle ?? "护眼纸面学习区"}</span>
      </div>

      <nav className={styles.tabs} aria-label="阅读页签导航">
        {TABS.map((tab) => {
          const active = pathname === tab.href;
          return (
            <Link
              key={tab.href}
              className={`${styles.tab} ${active ? styles.tabActive : ""}`}
              href={tab.href}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>

      <Link className={styles.backHome} href="/">
        返回首页
      </Link>
    </header>
  );
}
