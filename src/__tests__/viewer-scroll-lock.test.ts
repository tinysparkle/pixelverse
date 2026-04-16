// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { lockViewerScroll } from "@/components/notes/viewerScrollLock";

describe("viewer scroll lock", () => {
  it("关闭预览时恢复 body 和 html 的滚动样式", () => {
    document.body.style.overflow = "auto";
    document.body.style.touchAction = "pan-y";
    document.documentElement.style.overflow = "scroll";
    document.documentElement.style.touchAction = "manipulation";

    const unlock = lockViewerScroll();

    expect(document.body.style.overflow).toBe("hidden");
    expect(document.body.style.touchAction).toBe("none");
    expect(document.documentElement.style.overflow).toBe("hidden");
    expect(document.documentElement.style.touchAction).toBe("none");

    unlock();

    expect(document.body.style.overflow).toBe("auto");
    expect(document.body.style.touchAction).toBe("pan-y");
    expect(document.documentElement.style.overflow).toBe("scroll");
    expect(document.documentElement.style.touchAction).toBe("manipulation");
  });

  it("重复调用 unlock 不会抛错", () => {
    const unlock = lockViewerScroll();

    expect(() => unlock()).not.toThrow();
    expect(() => unlock()).not.toThrow();
  });

  it("解锁后完整恢复锁定前的已有样式", () => {
    document.body.style.overflow = "clip";
    document.body.style.touchAction = "manipulation";
    document.documentElement.style.overflow = "auto";
    document.documentElement.style.touchAction = "pan-x";

    const unlock = lockViewerScroll();
    unlock();

    expect(document.body.style.overflow).toBe("clip");
    expect(document.body.style.touchAction).toBe("manipulation");
    expect(document.documentElement.style.overflow).toBe("auto");
    expect(document.documentElement.style.touchAction).toBe("pan-x");
  });

  it("多次锁定时应保持引用计数，直到最后一次解锁才恢复", () => {
    document.body.style.overflow = "";
    document.body.style.touchAction = "";
    document.documentElement.style.overflow = "";
    document.documentElement.style.touchAction = "";

    const firstUnlock = lockViewerScroll();
    const secondUnlock = lockViewerScroll();

    expect(document.body.style.overflow).toBe("hidden");
    expect(document.documentElement.style.overflow).toBe("hidden");

    firstUnlock();

    expect(document.body.style.overflow).toBe("hidden");
    expect(document.documentElement.style.overflow).toBe("hidden");

    secondUnlock();

    expect(document.body.style.overflow).toBe("");
    expect(document.documentElement.style.overflow).toBe("");
  });

  it("并发锁时最终应恢复到原始非空样式", () => {
    document.body.style.overflow = "auto";
    document.body.style.touchAction = "pan-y";
    document.documentElement.style.overflow = "scroll";
    document.documentElement.style.touchAction = "manipulation";

    const firstUnlock = lockViewerScroll();
    const secondUnlock = lockViewerScroll();

    firstUnlock();
    expect(document.body.style.overflow).toBe("hidden");
    expect(document.documentElement.style.overflow).toBe("hidden");

    secondUnlock();

    expect(document.body.style.overflow).toBe("auto");
    expect(document.body.style.touchAction).toBe("pan-y");
    expect(document.documentElement.style.overflow).toBe("scroll");
    expect(document.documentElement.style.touchAction).toBe("manipulation");
  });

  it("当外部仅锁定 body 时，解锁后不应残留 hidden", () => {
    document.body.style.overflow = "hidden";
    document.body.style.touchAction = "";
    document.documentElement.style.overflow = "";
    document.documentElement.style.touchAction = "";

    const unlock = lockViewerScroll();
    unlock();

    expect(document.body.style.overflow).toBe("");
    expect(document.documentElement.style.overflow).toBe("");
  });
});
