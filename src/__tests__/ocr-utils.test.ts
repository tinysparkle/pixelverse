import { describe, expect, it } from "vitest";
import {
  buildSelectableOcrWords,
  normalizeOcrText,
  type OcrWordBox,
} from "@/components/notes/ocrUtils";

describe("ocr utils", () => {
  it("将 OCR 词框映射为可叠加的百分比坐标", () => {
    const words: OcrWordBox[] = [
      {
        text: "Pixelverse",
        bbox: { x0: 100, y0: 50, x1: 340, y1: 110 },
      },
      {
        text: "Cloud",
        bbox: { x0: 380, y0: 54, x1: 500, y1: 108 },
      },
    ];

    expect(buildSelectableOcrWords(words, 1000, 500)).toEqual([
      {
        id: "ocr-word-0",
        text: "Pixelverse",
        leftPct: 10,
        topPct: 10,
        widthPct: 24,
        heightPct: 12,
      },
      {
        id: "ocr-word-1",
        text: "Cloud",
        leftPct: 38,
        topPct: 10.8,
        widthPct: 12,
        heightPct: 10.8,
      },
    ]);
  });

  it("忽略空文字和异常边界框", () => {
    const words: OcrWordBox[] = [
      {
        text: "   ",
        bbox: { x0: 0, y0: 0, x1: 80, y1: 20 },
      },
      {
        text: "Bad",
        bbox: { x0: 120, y0: 80, x1: 100, y1: 60 },
      },
      {
        text: "Good",
        bbox: { x0: 20, y0: 30, x1: 120, y1: 70 },
      },
    ];

    expect(buildSelectableOcrWords(words, 200, 100)).toEqual([
      {
        id: "ocr-word-2",
        text: "Good",
        leftPct: 10,
        topPct: 30,
        widthPct: 50,
        heightPct: 40,
      },
    ]);
  });

  it("规整 OCR 纯文本用于移动端兜底复制", () => {
    expect(
      normalizeOcrText("  第一行 \n\n 第二行\t\t内容  \n  \nThird line  ")
    ).toBe("第一行\n第二行 内容\nThird line");
  });
});
