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
});
