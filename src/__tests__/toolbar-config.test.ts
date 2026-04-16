import { describe, expect, it } from "vitest";
import {
  DEFAULT_TOOLBAR_BUTTON_IDS,
  TOOLBAR_BUTTON_REGISTRY,
  sanitizeToolbarButtonIds,
} from "@/components/notes/toolbarConfig";

describe("toolbar config", () => {
  it("默认按钮集包含当前工具栏按钮", () => {
    expect(DEFAULT_TOOLBAR_BUTTON_IDS).toEqual(
      expect.arrayContaining([
        "bold",
        "italic",
        "strike",
        "code",
        "heading1",
        "heading2",
        "heading3",
        "bulletList",
        "orderedList",
        "blockquote",
        "horizontalRule",
        "image",
      ])
    );
  });

  it("按钮库注册新开放按钮", () => {
    const ids = TOOLBAR_BUTTON_REGISTRY.map((item) => item.id);
    expect(ids).toEqual(expect.arrayContaining(["undo", "redo", "codeBlock", "link", "unlink"]));
  });

  it("过滤非法 id 并在空结果时回退默认集", () => {
    expect(sanitizeToolbarButtonIds(["bold", "invalid", "link"])).toEqual(["bold", "link"]);
    expect(sanitizeToolbarButtonIds(["invalid"])).toEqual(DEFAULT_TOOLBAR_BUTTON_IDS);
  });
});
