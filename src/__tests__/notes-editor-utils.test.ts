import { describe, expect, it } from "vitest";
import {
  clampImageWidth,
  extractImageViewerItems,
  findImageViewerIndex,
  formatUrlDisplayText,
  getContainerClassName,
  isPureUrlText,
  resolveInitialImageWidth,
} from "@/components/notes/editorUtils";

describe("notes editor utils", () => {
  it("识别纯 URL 文本", () => {
    expect(isPureUrlText("https://example.com/very/long/path")).toBe(true);
    expect(isPureUrlText("  http://example.com  ")).toBe(true);
    expect(isPureUrlText("请看 https://example.com")).toBe(false);
    expect(isPureUrlText("javascript:alert(1)")).toBe(false);
  });

  it("将长 URL 格式化为短文本", () => {
    const display = formatUrlDisplayText("https://example.com/some/really/long/path?query=123");
    expect(display.startsWith("example.com/")).toBe(true);
    expect(display.length).toBeLessThanOrEqual(36);
  });

  it("限制图片宽度范围", () => {
    expect(clampImageWidth(100)).toBe(120);
    expect(clampImageWidth(200)).toBe(200);
    expect(clampImageWidth(4000)).toBe(1200);
  });

  it("根据折叠状态返回布局 class", () => {
    expect(getContainerClassName(true)).toBe("container containerCollapsed");
    expect(getContainerClassName(false)).toBe("container");
  });

  it("根据容器宽度计算图片初始宽度", () => {
    expect(resolveInitialImageWidth(undefined)).toBe(560);
    expect(resolveInitialImageWidth(300)).toBe(240);
    expect(resolveInitialImageWidth(800)).toBe(640);
    expect(resolveInitialImageWidth(3000)).toBe(1200);
  });

  it("从 tiptap JSON 中提取当前笔记的图片列表", () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "开头" }],
        },
        {
          type: "image",
          attrs: { src: "/uploads/a.png" },
        },
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "列表里的图" }],
                },
                {
                  type: "image",
                  attrs: { src: "/uploads/b.webp" },
                },
              ],
            },
          ],
        },
        {
          type: "image",
          attrs: { src: "/uploads/a.png" },
        },
      ],
    };

    expect(extractImageViewerItems(doc)).toEqual([
      { key: "/uploads/a.png::0", src: "/uploads/a.png" },
      { key: "/uploads/b.webp::1", src: "/uploads/b.webp" },
      { key: "/uploads/a.png::2", src: "/uploads/a.png" },
    ]);
  });

  it("根据当前图片 src 定位预览起始索引", () => {
    const images = [
      { key: "1", src: "/uploads/a.png" },
      { key: "2", src: "/uploads/b.webp" },
      { key: "3", src: "/uploads/c.jpg" },
    ];

    expect(findImageViewerIndex(images, "/uploads/b.webp")).toBe(1);
    expect(findImageViewerIndex(images, "/uploads/missing.png")).toBe(0);
  });
});
