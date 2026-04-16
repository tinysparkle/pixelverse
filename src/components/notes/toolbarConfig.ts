export const TOOLBAR_STORAGE_KEY = "pixelverse_notes_toolbar_buttons";

export type ToolbarButtonId =
  | "bold"
  | "italic"
  | "strike"
  | "code"
  | "codeBlock"
  | "heading1"
  | "heading2"
  | "heading3"
  | "bulletList"
  | "orderedList"
  | "blockquote"
  | "horizontalRule"
  | "undo"
  | "redo"
  | "link"
  | "unlink"
  | "image";

export type ToolbarButtonGroup = "history" | "inline" | "heading" | "block" | "link" | "media";

export interface ToolbarButtonConfig {
  id: ToolbarButtonId;
  label: string;
  title: string;
  shortcut?: string;
  group: ToolbarButtonGroup;
}

export const TOOLBAR_BUTTON_REGISTRY: ToolbarButtonConfig[] = [
  { id: "undo", label: "↶", title: "撤销", shortcut: "⌘Z", group: "history" },
  { id: "redo", label: "↷", title: "重做", shortcut: "⌘⇧Z", group: "history" },
  { id: "bold", label: "B", title: "粗体", shortcut: "⌘B", group: "inline" },
  { id: "italic", label: "I", title: "斜体", shortcut: "⌘I", group: "inline" },
  { id: "strike", label: "S", title: "删除线", shortcut: "⌘⇧X", group: "inline" },
  { id: "code", label: "~", title: "行内代码", shortcut: "⌘E", group: "inline" },
  { id: "codeBlock", label: "{}", title: "代码块", shortcut: "⌘⌥C", group: "inline" },
  { id: "heading1", label: "H1", title: "标题 1", shortcut: "⌘⌥1", group: "heading" },
  { id: "heading2", label: "H2", title: "标题 2", shortcut: "⌘⌥2", group: "heading" },
  { id: "heading3", label: "H3", title: "标题 3", shortcut: "⌘⌥3", group: "heading" },
  { id: "bulletList", label: "•", title: "无序列表", shortcut: "⌘⇧8", group: "block" },
  { id: "orderedList", label: "1.", title: "有序列表", shortcut: "⌘⇧7", group: "block" },
  { id: "blockquote", label: "｜", title: "引用", shortcut: "⌘⇧B", group: "block" },
  { id: "horizontalRule", label: "—", title: "分隔线", group: "block" },
  { id: "link", label: "链", title: "插入链接", shortcut: "⌘K", group: "link" },
  { id: "unlink", label: "×链", title: "取消链接", group: "link" },
  { id: "image", label: "图", title: "插入图片", group: "media" },
];

export const DEFAULT_TOOLBAR_BUTTON_IDS: ToolbarButtonId[] = [
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
];

const VALID_IDS = new Set<ToolbarButtonId>(TOOLBAR_BUTTON_REGISTRY.map((item) => item.id));

export function sanitizeToolbarButtonIds(ids: string[]): ToolbarButtonId[] {
  const unique: ToolbarButtonId[] = [];
  const seen = new Set<ToolbarButtonId>();

  for (const id of ids) {
    if (!VALID_IDS.has(id as ToolbarButtonId)) continue;
    const typedId = id as ToolbarButtonId;
    if (seen.has(typedId)) continue;
    seen.add(typedId);
    unique.push(typedId);
  }

  if (unique.length === 0) return [...DEFAULT_TOOLBAR_BUTTON_IDS];
  return unique;
}
