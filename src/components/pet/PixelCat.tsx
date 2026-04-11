"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import styles from "./pet.module.css";

/*
 * 像素幽灵 — Pixelverse 吉祥物
 * 半透明发光体，红色像素眼，暖黄辉光
 * 悬浮飘动，和深色宇宙主题天然融合
 */

type Activity = "idle" | "float" | "sleep";

const THOUGHTS = [
  "嘘...我是幽灵喵",
  "飘来飘去真自在",
  "这里好暖和",
  "笔记写好了吗？",
  "嘿~别怕",
  "在偷看你写代码",
  "想吃...等等幽灵要吃东西吗",
  "今天也辛苦了",
  "好困...幽灵也会困吗",
  "喜欢这个角落",
  "..zzZ",
];

function GhostSVG({ activity, isHappy }: { activity: Activity; isHappy: boolean }) {
  const isSleeping = activity === "sleep";

  return (
    <svg
      viewBox="0 0 60 68"
      width={72}
      height={82}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ overflow: "visible" }}
    >
      {/* 身体：圆顶 + 波浪下摆 */}
      <path
        className={styles.ghostBody}
        d="M8,34
           C8,16 18,4 30,4
           C42,4 52,16 52,34
           L52,52
           Q52,58 47,54
           Q42,50 38,56
           Q34,62 30,56
           Q26,50 22,56
           Q18,62 13,56
           Q8,50 8,52
           Z"
        fill="rgba(240, 236, 232, 0.72)"
      />

      {/* 眼睛 */}
      {isSleeping ? (
        <g stroke="rgba(255, 60, 40, 0.5)" strokeWidth="2" strokeLinecap="round" fill="none">
          <path d="M19,30 Q22,33 25,30" />
          <path d="M35,30 Q38,33 41,30" />
        </g>
      ) : isHappy ? (
        <g stroke="#ff3c28" strokeWidth="2.2" strokeLinecap="round" fill="none">
          <path d="M19,32 Q22,27 25,32" />
          <path d="M35,32 Q38,27 41,32" />
        </g>
      ) : (
        <g className={styles.ghostEyes}>
          {/* 左眼：像素方块 */}
          <rect x="18" y="27" width="8" height="8" rx="1" fill="#ff3c28" />
          <rect x="22" y="29" width="2.5" height="3" rx="0.5" fill="white" opacity="0.7" />
          {/* 右眼 */}
          <rect x="34" y="27" width="8" height="8" rx="1" fill="#ff3c28" />
          <rect x="38" y="29" width="2.5" height="3" rx="0.5" fill="white" opacity="0.7" />
        </g>
      )}

      {/* 嘴巴 */}
      <path
        d="M25,40 Q30,44 35,40"
        stroke="rgba(255, 255, 255, 0.35)"
        strokeWidth="1.5"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

function Sparkle({ delay, offsetX, offsetY }: { delay: number; offsetX: number; offsetY: number }) {
  return <span className={styles.sparkle} style={{ left: offsetX, top: offsetY, animationDelay: `${delay}s` }} />;
}

export default function PixelCat() {
  const [posX, setPosX] = useState<number | null>(null);
  const [facingLeft, setFacingLeft] = useState(false);
  const [activity, setActivity] = useState<Activity>("idle");
  const [thought, setThought] = useState<string | null>(null);
  const [isHappy, setIsHappy] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [showSparkles, setShowSparkles] = useState(false);

  const activityRef = useRef<Activity>("idle");
  const GHOST_W = 72;

  useEffect(() => { setPosX(Math.floor(window.innerWidth * 0.65)); }, []);

  // 飘动
  useEffect(() => {
    if (activity !== "float") return;
    const interval = setInterval(() => {
      setPosX((prev) => {
        if (prev == null) return prev;
        const maxX = window.innerWidth - GHOST_W - 16;
        const step = facingLeft ? -1.5 : 1.5;
        const next = prev + step;
        if (next <= 16) { setFacingLeft(false); return 16; }
        if (next >= maxX) { setFacingLeft(true); return maxX; }
        return next;
      });
    }, 40);
    return () => clearInterval(interval);
  }, [activity, facingLeft]);

  // 活动调度
  useEffect(() => {
    const schedule: Array<{ act: Activity; dur: [number, number] }> = [
      { act: "idle", dur: [3000, 5000] },
      { act: "float", dur: [8000, 14000] },
      { act: "idle", dur: [4000, 6000] },
      { act: "float", dur: [6000, 10000] },
      { act: "idle", dur: [3000, 5000] },
      { act: "sleep", dur: [8000, 14000] },
      { act: "idle", dur: [2000, 4000] },
      { act: "float", dur: [7000, 12000] },
    ];
    let idx = 0;
    let timerId: ReturnType<typeof setTimeout>;
    const next = () => {
      const { act, dur } = schedule[idx % schedule.length];
      idx++;
      setActivity(act);
      activityRef.current = act;
      timerId = setTimeout(next, dur[0] + Math.random() * (dur[1] - dur[0]));
    };
    timerId = setTimeout(next, 2000);
    return () => clearTimeout(timerId);
  }, []);

  // 思考气泡
  useEffect(() => {
    let timerId: ReturnType<typeof setTimeout>;
    const show = () => {
      if (activityRef.current === "sleep") { timerId = setTimeout(show, 12000 + Math.random() * 8000); return; }
      setThought(THOUGHTS[Math.floor(Math.random() * THOUGHTS.length)]);
      setTimeout(() => setThought(null), 3500);
      timerId = setTimeout(show, 15000 + Math.random() * 20000);
    };
    timerId = setTimeout(show, 6000 + Math.random() * 6000);
    return () => clearTimeout(timerId);
  }, []);

  const handleClick = useCallback(() => {
    setIsHappy(true);
    setThought("被发现了！");
    setShowSparkles(true);
    setTimeout(() => { setIsHappy(false); setThought(null); setShowSparkles(false); }, 2800);
  }, []);

  if (posX == null) return null;

  const actClass = activity === "float" ? styles.floating
    : activity === "sleep" ? styles.sleeping
    : styles.idling;

  return (
    <div
      className={`${styles.ghostWrap} ${actClass} ${isHovered ? styles.hovered : ""} ${isHappy ? styles.happy : ""}`}
      style={{ position: "fixed", bottom: 10, left: posX, zIndex: 9990 }}
      onClick={handleClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      role="img"
      aria-label="像素幽灵"
    >
      {showSparkles && (
        <div className={styles.sparkles} aria-hidden="true">
          <Sparkle delay={0} offsetX={8} offsetY={-4} />
          <Sparkle delay={0.1} offsetX={38} offsetY={-12} />
          <Sparkle delay={0.2} offsetX={62} offsetY={-2} />
          <Sparkle delay={0.06} offsetX={24} offsetY={-16} />
          <Sparkle delay={0.16} offsetX={52} offsetY={-8} />
        </div>
      )}

      {thought && (
        <div className={styles.bubble}><span>{thought}</span><div className={styles.bubbleTail} /></div>
      )}

      {activity === "sleep" && !isHappy && (
        <div className={styles.zzz}><span>z</span><span>Z</span><span>Z</span></div>
      )}

      <GhostSVG activity={activity} isHappy={isHappy} />
    </div>
  );
}
