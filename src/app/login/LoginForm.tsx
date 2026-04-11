"use client";

import { useState } from "react";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import styles from "./login.module.css";

export default function LoginForm() {
  const isDev = process.env.NODE_ENV !== "production";
  const [account, setAccount] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const result = await signIn("credentials", {
      email: account,
      password,
      redirect: false,
    });

    setLoading(false);

    if (result?.error) {
      setError("账号或密码不正确");
      return;
    }

    router.replace("/");
    router.refresh();
  };

  return (
    <main className={styles.page}>
      {/* Decorative pixel grid corners */}
      <div className={styles.gridCorner} aria-hidden="true" />

      <div className={styles.card}>
        <div className={styles.cardGlow} aria-hidden="true" />

        <div className={styles.header}>
          <Link className={styles.brand} href="/">
            <strong>Pixelverse</strong>
          </Link>
          <h1>登录</h1>
          <p>登录后回到首页，继续进入你的工作区。</p>
          {isDev ? (
            <p className={styles.devHint}>
              <span className={styles.devDot} />
              本地开发默认账号：admin / 123456
            </p>
          ) : null}
        </div>

        <form className={styles.form} onSubmit={handleSubmit}>
          <label className={styles.label}>
            <span>账号</span>
            <input
              className={styles.input}
              type="text"
              value={account}
              onChange={(e) => setAccount(e.target.value)}
              placeholder="admin"
              required
              autoFocus
              autoCapitalize="none"
            />
          </label>

          <label className={styles.label}>
            <span>密码</span>
            <input
              className={styles.input}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••"
              required
            />
          </label>

          {error ? <p className={styles.error}>{error}</p> : null}

          <button className={styles.submit} type="submit" disabled={loading}>
            {loading ? "登录中..." : "登 录"}
          </button>
        </form>

        <div className={styles.footer}>
          <Link href="/">← 返回首页</Link>
        </div>
      </div>
    </main>
  );
}
