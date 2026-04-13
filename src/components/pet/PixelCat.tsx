"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import styles from "./pet.module.css";

/*
 * 像素小猫 — 底部行走
 * 水平侧面猫：头在右，身体横向展开，尾巴在左
 * 只在屏幕底部移动，平滑步行，自然行为循环
 */

type Pose = "idle" | "walk1" | "walk2" | "sit" | "lick" | "sleep" | "happy";

// 水平侧面猫 — 20 列 x 12 行
// 1=outline 2=fur 3=stripe 4=earInner 5=eye 6=cheek 7=nose
// 8=tail 9=happyEye A=white B=mouth C=whisker
const SPRITE: Record<Pose, string> = {
  idle: `
    .............11.11..
    ............1441441.
    ...........122222221
    .888......1222222221
    .8881111..12A52A5C21
    ..12222111122672621.
    ..122333222222BB221.
    ..12222222222222221.
    ...122222222222221..
    ...12222222222221...
    ...1..1.....1..1....
    ...11.......11......
  `,
  walk1: `
    .............11.11..
    ............1441441.
    ...........122222221
    .888......1222222221
    .8881111..122A55AC21
    ..12222111122676721.
    ..122333222222BB221.
    ..12222222222222221.
    ...12222222222221...
    ...1222222222221....
    ...1..1......11.....
    ....11.....1..1.....
  `,
  walk2: `
    .............11.11..
    ............1441441.
    ...........122222221
    .888......1222222221
    .8881111..122A55AC21
    ..12222111122676721.
    ..122333222222BB221.
    ..12222222222222221.
    ...12222222222221...
    ...1222222222221....
    ....11.....1..1.....
    ...1..1......11.....
  `,
  sit: `
    .............11.11..
    ............1441441.
    ...........122222221
    ..........1222222221
    .........122A55AC221
    ..88....11226767221.
    ..88111122222BB221..
    ...122222222222221..
    ...122333222222221..
    ...1222222222222221.
    ....12222222112221..
    .....111111...111...
  `,
  lick: `
    .............11.11..
    ............1441441.
    ...........122222221
    ..........1222222221
    .........122A55AC221
    ..88....11226767B21.
    ..88111122222BB227..
    ...122222222222221..
    ...122333222222221..
    ...1222222222222221.
    ....12222222112221..
    .....111111...111...
  `,
  sleep: `
    ....................
    .............11.11..
    ............1441441.
    ...........122222221
    ..88......1222222221
    ..88111...1221991C21
    ...1222111122676B21.
    ...1223332222222221.
    ...1222222222222221.
    ...12222222222222221
    ....12222222212221..
    .....11111111111....
  `,
  happy: `
    .............11.11..
    ............1441441.
    ...........122222221
    .888......1222222221
    .8881111..1229999C21
    ..12222111122676721.
    ..122333222222BB221.
    ..12222222222222221.
    ...12222222222221...
    ...1222222222221....
    ...1..1......11.....
    ....11.....1..1.....
  `,
};

const COLOR_MAP: Record<string, string> = {
  "1": "#3a3535",     // outline
  "2": "#e8e3e0",     // 浅灰白毛
  "3": "#c8c0bc",     // 深灰花纹
  "4": "#c49090",     // 耳内粉褐
  "5": "#1a1818",     // 眼瞳
  "6": "#f0b8b8",     // 腮红
  "7": "#d48888",     // 鼻子
  "8": "#c8c0bc",     // 尾巴
  "9": "#d48888",     // 开心眼 (^_^)
  "A": "#ffffff",     // 眼白
  "B": "#7c5151",     // 嘴巴
  "C": "#8b7b7b",     // 胡须
};

const THOUGHTS = [
  "喵~ 你好呀",
  "想吃小鱼干...",
  "这人在写代码？",
  "键盘好暖和",
  "想被摸摸头",
  "午觉时间到了喵",
  "笔记写好了吗？",
  "窗外有只鸟！",
  "喵呜~",
  "今天也辛苦了喵",
  "..zzZ",
];

function parseSprite(sprite: string): Array<{ x: number; y: number; color: string }> {
  const pixels: Array<{ x: number; y: number; color: string }> = [];
  // 每行单独 trim：外层 trim 只能去掉首尾空白，行内缩进会让第 2 行起被整体右移，
  // 导致耳朵像素落在 80px 容器之外（bald cat bug）。
  const lines = sprite
    .trim()
    .split("\n")
    .map((l) => l.trim());
  for (let y = 0; y < lines.length; y++) {
    const row = lines[y];
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch !== "." && ch !== " " && COLOR_MAP[ch]) {
        pixels.push({ x, y, color: COLOR_MAP[ch] });
      }
    }
  }
  return pixels;
}

const PARSED: Record<Pose, ReturnType<typeof parseSprite>> = {
  idle: parseSprite(SPRITE.idle),
  walk1: parseSprite(SPRITE.walk1),
  walk2: parseSprite(SPRITE.walk2),
  sit: parseSprite(SPRITE.sit),
  lick: parseSprite(SPRITE.lick),
  sleep: parseSprite(SPRITE.sleep),
  happy: parseSprite(SPRITE.happy),
};

const PX = 4;
const CAT_W = 23 * PX;
const CAT_H = 13 * PX;

type Activity = "idle" | "walk" | "sit" | "lick" | "sleep";

export default function PixelCat() {
  const [pose, setPose] = useState<Pose>("idle");
  // posX 初始为 null：SSR 与首屏客户端渲染保持一致（都不渲染），
  // 挂载后再读取 window.innerWidth 设置真实位置，避免 hydration mismatch。
  const [posX, setPosX] = useState<number | null>(null);
  const [facingLeft, setFacingLeft] = useState(false);
  const [activity, setActivity] = useState<Activity>("idle");
  const [thought, setThought] = useState<string | null>(null);
  const [isHappy, setIsHappy] = useState(false);

  const activityRef = useRef<Activity>("idle");
  const posXRef = useRef<number | null>(posX);
  posXRef.current = posX;

  // 挂载后初始化位置
  useEffect(() => {
    setPosX(Math.floor(window.innerWidth * 0.65));
  }, []);

  // 行走动画 — 逐帧步行，不瞬移
  useEffect(() => {
    if (activity !== "walk") return;

    let frame = 0;
    const interval = setInterval(() => {
      frame++;
      setPose(isHappy ? "happy" : frame % 2 === 0 ? "walk1" : "walk2");

      setPosX((prev: number | null) => {
        if (prev == null) return prev;
        const maxX = window.innerWidth - CAT_W - 16;
        const step = facingLeft ? -4 : 4;
        const next = prev + step;

        if (next <= 16) {
          setFacingLeft(false);
          return 16;
        }
        if (next >= maxX) {
          setFacingLeft(true);
          return maxX;
        }
        return next;
      });
    }, 220);

    return () => clearInterval(interval);
  }, [activity, facingLeft, isHappy]);

  // idle 时微微晃动尾巴（通过交替 idle 帧）
  useEffect(() => {
    if (activity !== "idle") return;
    setPose("idle");
  }, [activity]);

  // 活动调度器 — 自然行为循环
  useEffect(() => {
    const schedule: Array<{ act: Activity; dur: [number, number] }> = [
      { act: "idle", dur: [3000, 5000] },
      { act: "walk", dur: [6000, 10000] },
      { act: "sit", dur: [4000, 6000] },
      { act: "idle", dur: [2000, 4000] },
      { act: "walk", dur: [5000, 8000] },
      { act: "lick", dur: [3000, 5000] },
      { act: "idle", dur: [3000, 5000] },
      { act: "walk", dur: [4000, 7000] },
      { act: "sit", dur: [3000, 4000] },
      { act: "sleep", dur: [8000, 14000] },
    ];
    let idx = 0;
    let timerId: ReturnType<typeof setTimeout>;

    const next = () => {
      const { act, dur } = schedule[idx % schedule.length];
      idx++;
      setActivity(act);
      activityRef.current = act;

      switch (act) {
        case "idle": setPose("idle"); break;
        case "walk": setPose("walk1"); break;
        case "sit": setPose("sit"); break;
        case "lick": setPose("lick"); break;
        case "sleep": setPose("sleep"); break;
      }

      const duration = dur[0] + Math.random() * (dur[1] - dur[0]);
      timerId = setTimeout(next, duration);
    };

    timerId = setTimeout(next, 2500);
    return () => clearTimeout(timerId);
  }, []);

  // 思考气泡
  useEffect(() => {
    let timerId: ReturnType<typeof setTimeout>;

    const show = () => {
      if (activityRef.current === "sleep") {
        timerId = setTimeout(show, 10000 + Math.random() * 10000);
        return;
      }
      const text = THOUGHTS[Math.floor(Math.random() * THOUGHTS.length)];
      setThought(text);
      setTimeout(() => setThought(null), 3500);
      timerId = setTimeout(show, 15000 + Math.random() * 20000);
    };

    timerId = setTimeout(show, 8000 + Math.random() * 6000);
    return () => clearTimeout(timerId);
  }, []);

  // 点击开心
  const handleClick = useCallback(() => {
    setIsHappy(true);
    setPose("happy");
    setThought("喵！摸到我了~");
    setTimeout(() => {
      setIsHappy(false);
      setThought(null);
    }, 2800);
  }, []);

  const currentPixels: Array<{ x: number; y: number; color: string }> = isHappy
    ? PARSED.happy
    : PARSED[pose];

  // 挂载前不渲染，确保 SSR 输出与首屏客户端 HTML 一致
  if (posX == null) return null;

  return (
    <div
      className={styles.catWrap}
      style={{
        position: "fixed",
        bottom: 6,
        left: posX,
        zIndex: 9990,
      }}
      onClick={handleClick}
      role="img"
      aria-label="像素小猫"
    >
      {/* 思考气泡 */}
      {thought && (
        <div className={styles.bubble}>
          <span>{thought}</span>
          <div className={styles.bubbleTail} />
        </div>
      )}

      {/* Zzz */}
      {activity === "sleep" && !isHappy && (
        <div className={styles.zzz}>
          <span>z</span><span>Z</span><span>Z</span>
        </div>
      )}

      {/* 像素猫身体 */}
      <div
        className={styles.cat}
        style={{
          transform: facingLeft ? "scaleX(-1)" : "none",
          width: CAT_W,
          height: CAT_H,
        }}
      >
        {currentPixels.map((p: { x: number; y: number; color: string }, i: number) => (
          <span
            key={i}
            className={styles.pixel}
            style={{
              left: p.x * PX,
              top: p.y * PX,
              width: PX,
              height: PX,
              background: p.color,
            }}
          />
        ))}
      </div>
    </div>
  );
}
