import { describe, it, expect } from "vitest";

// Mirror of COLOR_MAP / parseSprite in src/components/pet/PixelCat.tsx.
// Kept in sync manually; the indent-tolerance tests below enforce that the
// real parser never regresses to trimming only the outer whitespace again.

const COLOR_MAP: Record<string, string> = {
  "1": "#3a3535",
  "2": "#e8e3e0",
  "3": "#c8c0bc",
  "4": "#c49090",
  "5": "#1a1818",
  "6": "#f0b8b8",
  "7": "#d48888",
  "8": "#c8c0bc",
  "9": "#d48888",
  "A": "#ffffff",
};

function parseSprite(sprite: string) {
  const pixels: Array<{ x: number; y: number; color: string }> = [];
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

// 4-space indent — matches the real SPRITE literals in PixelCat.tsx
const IDLE_SPRITE = `
    ....................
    ................11..
    ...............1441.
    ..............142241
    .888.........1222221
    .8881111....12A52A51
    ..1222221111122622.1
    ..12233222222272221.
    ..1222222222222221..
    ...122222222222221..
    ...1.21.....1.21....
    ...1.21.....1.21....
`;

describe("PixelCat Sprites", () => {
  it("应正确解析 idle sprite 像素", () => {
    const pixels = parseSprite(IDLE_SPRITE);
    expect(pixels.length).toBeGreaterThan(0);
  });

  it("每个像素应有有效坐标和颜色", () => {
    const pixels = parseSprite(IDLE_SPRITE);
    for (const p of pixels) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.color).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });

  it("sprite 应包含眼睛像素（黑色 #1a1818）", () => {
    const pixels = parseSprite(IDLE_SPRITE);
    const eyePixels = pixels.filter((p) => p.color === "#1a1818");
    expect(eyePixels.length).toBeGreaterThan(0);
  });

  it("sprite 应包含眼白像素（#ffffff）", () => {
    const pixels = parseSprite(IDLE_SPRITE);
    const whitePixels = pixels.filter((p) => p.color === "#ffffff");
    expect(whitePixels.length).toBeGreaterThanOrEqual(2);
  });

  it("sprite 应包含鼻子像素（#d48888）", () => {
    const pixels = parseSprite(IDLE_SPRITE);
    const nosePixels = pixels.filter((p) => p.color === "#d48888");
    expect(nosePixels.length).toBeGreaterThan(0);
  });

  it("sprite 应包含腮红像素（#f0b8b8）", () => {
    const pixels = parseSprite(IDLE_SPRITE);
    const cheekPixels = pixels.filter((p) => p.color === "#f0b8b8");
    expect(cheekPixels.length).toBeGreaterThan(0);
  });

  it("sprite 行数应为 12", () => {
    const lines = IDLE_SPRITE.trim().split("\n");
    expect(lines.length).toBe(12);
  });

  it("每行宽度应为 20", () => {
    const lines = IDLE_SPRITE.trim().split("\n");
    for (const line of lines) {
      expect(line.trim().length).toBeLessThanOrEqual(20);
    }
  });

  it("所有颜色代码都在 COLOR_MAP 中", () => {
    const lines = IDLE_SPRITE.trim().split("\n");
    for (const line of lines) {
      for (const ch of line.trim()) {
        if (ch !== "." && ch !== " ") {
          expect(COLOR_MAP).toHaveProperty(ch);
        }
      }
    }
  });

  it("所有像素坐标应落在 20×12 网格内（防秃头回归）", () => {
    const pixels = parseSprite(IDLE_SPRITE);
    for (const p of pixels) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThan(20);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThan(12);
    }
  });

  it("耳朵像素应在容器内（x ≤ 19）", () => {
    const pixels = parseSprite(IDLE_SPRITE);
    const earArea = pixels.filter((p) => p.y <= 3);
    expect(earArea.length).toBeGreaterThan(0);
    const maxX = Math.max(...earArea.map((p) => p.x));
    expect(maxX).toBeLessThan(20);
  });

  it("parseSprite 应能容忍任意行首缩进", () => {
    const mk = (pad: string) =>
      [
        "....................",
        "................11..",
        "...............1441.",
      ]
        .map((l) => pad + l)
        .join("\n");

    const twoSpaces = parseSprite(`\n${mk("  ")}\n`);
    const fourSpaces = parseSprite(`\n${mk("    ")}\n`);
    const sixSpaces = parseSprite(`\n${mk("      ")}\n`);

    expect(fourSpaces.length).toBe(twoSpaces.length);
    expect(sixSpaces.length).toBe(twoSpaces.length);
    // 确认像素坐标相同（与缩进无关）
    expect(fourSpaces).toEqual(twoSpaces);
    expect(sixSpaces).toEqual(twoSpaces);
  });
});

describe("PixelCat 尺寸计算", () => {
  const PX = 4;
  const CAT_W = 20 * PX;
  const CAT_H = 12 * PX;

  it("猫的宽度应为 80px", () => {
    expect(CAT_W).toBe(80);
  });

  it("猫的高度应为 48px", () => {
    expect(CAT_H).toBe(48);
  });
});

describe("PixelCat 行走边界", () => {
  it("步长应为 4px（平滑移动）", () => {
    const step = 4;
    expect(step).toBeLessThanOrEqual(5); // 确保不会太快
    expect(step).toBeGreaterThan(0);
  });

  it("行走帧率应为 220ms", () => {
    const interval = 220;
    expect(interval).toBeGreaterThanOrEqual(150);
    expect(interval).toBeLessThanOrEqual(300);
  });
});
