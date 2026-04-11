"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import Link from "next/link";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Image from "@tiptap/extension-image";
import { useRouter } from "next/navigation";
import styles from "./notes.module.css";

interface NoteItem {
  id: string;
  title: string;
  updatedAt: string;
  excerpt: string;
}

interface NoteDetail {
  id: string;
  title: string;
  contentJson: string | null;
  contentText: string;
  updatedAt: string;
}

type SaveState = "saved" | "saving" | "dirty" | "error";

/* ── 图片上传处理 ── */
async function uploadImage(file: File): Promise<string | null> {
  const formData = new FormData();
  formData.append("file", file);
  try {
    const res = await fetch("/api/upload", { method: "POST", body: formData });
    if (res.ok) {
      const data = await res.json();
      return data.url;
    }
  } catch { /* ignore */ }
  return null;
}

/* ── 工具栏按钮 ── */
function Toolbar({ editor, onImageUpload }: { editor: Editor | null; onImageUpload: () => void }) {
  if (!editor) return null;
  const btn = (
    label: string,
    action: () => void,
    active: boolean,
    title: string,
    shortcut?: string
  ) => (
    <button
      className={`${styles.tbBtn} ${active ? styles.tbActive : ""}`}
      onClick={action}
      title={shortcut ? `${title} (${shortcut})` : title}
      type="button"
    >
      {label}
    </button>
  );

  const e = editor;

  return (
    <div className={styles.toolbar}>
      <div className={styles.tbGroup}>
        {btn("B", () => e.chain().focus().toggleBold().run(), e.isActive("bold"), "粗体", "⌘B")}
        {btn("I", () => e.chain().focus().toggleItalic().run(), e.isActive("italic"), "斜体", "⌘I")}
        {btn("S", () => e.chain().focus().toggleStrike().run(), e.isActive("strike"), "删除线", "⌘⇧X")}
        {btn("~", () => e.chain().focus().toggleCode().run(), e.isActive("code"), "行内代码", "⌘E")}
      </div>
      <span className={styles.tbDivider} />
      <div className={styles.tbGroup}>
        {btn("H1", () => e.chain().focus().toggleHeading({ level: 1 }).run(), e.isActive("heading", { level: 1 }), "标题 1", "⌘⌥1")}
        {btn("H2", () => e.chain().focus().toggleHeading({ level: 2 }).run(), e.isActive("heading", { level: 2 }), "标题 2", "⌘⌥2")}
        {btn("H3", () => e.chain().focus().toggleHeading({ level: 3 }).run(), e.isActive("heading", { level: 3 }), "标题 3", "⌘⌥3")}
      </div>
      <span className={styles.tbDivider} />
      <div className={styles.tbGroup}>
        {btn("•", () => e.chain().focus().toggleBulletList().run(), e.isActive("bulletList"), "无序列表", "⌘⇧8")}
        {btn("1.", () => e.chain().focus().toggleOrderedList().run(), e.isActive("orderedList"), "有序列表", "⌘⇧7")}
        {btn("｜", () => e.chain().focus().toggleBlockquote().run(), e.isActive("blockquote"), "引用", "⌘⇧B")}
        {btn("—", () => e.chain().focus().setHorizontalRule().run(), false, "分隔线")}
      </div>
      <span className={styles.tbDivider} />
      <div className={styles.tbGroup}>
        {btn("📷", onImageUpload, false, "插入图片")}
      </div>
    </div>
  );
}

export default function NotesPage() {
  const router = useRouter();
  const [notesList, setNotesList] = useState<NoteItem[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeNote, setActiveNote] = useState<NoteDetail | null>(null);
  const [pendingDelete, setPendingDelete] = useState<NoteDetail | null>(null);
  const [title, setTitle] = useState("");
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirtyRef = useRef(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: "开始记录你的想法..." }),
      Image.configure({ inline: false, allowBase64: false }),
    ],
    onUpdate: () => {
      dirtyRef.current = true;
      setSaveState("dirty");
      debounceSave();
    },
    editorProps: {
      handlePaste: (_view, event) => {
        const items = event.clipboardData?.items;
        if (!items) return false;

        for (const item of items) {
          if (item.type.startsWith("image/")) {
            event.preventDefault();
            const file = item.getAsFile();
            if (file) {
              uploadImage(file).then((url) => {
                if (url && editor) {
                  editor.chain().focus().setImage({ src: url }).run();
                }
              });
            }
            return true;
          }
        }
        return false;
      },
      handleDrop: (_view, event) => {
        const files = event.dataTransfer?.files;
        if (!files?.length) return false;

        for (const file of files) {
          if (file.type.startsWith("image/")) {
            event.preventDefault();
            uploadImage(file).then((url) => {
              if (url && editor) {
                editor.chain().focus().setImage({ src: url }).run();
              }
            });
            return true;
          }
        }
        return false;
      },
    },
  });

  // 图片上传按钮处理
  const handleImageUpload = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !editor) return;
    const url = await uploadImage(file);
    if (url) {
      editor.chain().focus().setImage({ src: url }).run();
    }
    e.target.value = "";
  }, [editor]);

  // 字数统计
  const charCount = editor?.storage.characterCount?.characters?.() ?? editor?.getText().length ?? 0;

  // 拉取笔记列表
  const fetchList = useCallback(async (query?: string) => {
    const url = query ? `/api/notes?query=${encodeURIComponent(query)}` : "/api/notes";
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      setNotesList(data);
      return data as NoteItem[];
    }

    if (res.status === 401) {
      router.push("/login");
    }

    return [];
  }, [router]);

  // 拉取单篇笔记
  const fetchNote = useCallback(
    async (id: string) => {
      const res = await fetch(`/api/notes/${id}`);
      if (res.ok) {
        const data: NoteDetail = await res.json();
        setActiveNote(data);
        setTitle(data.title);
        dirtyRef.current = false;
        setSaveState("saved");
        return;
      }

      if (res.status === 401) {
        router.push("/login");
      }
    },
    [router]
  );

  useEffect(() => {
    if (!editor) {
      return;
    }

    if (!activeNote) {
      editor.commands.setContent("", { emitUpdate: false });
      return;
    }

    if (activeNote.contentJson) {
      editor.commands.setContent(JSON.parse(activeNote.contentJson), { emitUpdate: false });
    } else {
      editor.commands.setContent("", { emitUpdate: false });
    }

    dirtyRef.current = false;
    setSaveState("saved");
  }, [editor, activeNote]);

  // 保存当前笔记
  const saveNote = useCallback(async () => {
    if (!activeId || !editor || !dirtyRef.current) return;

    setSaveState("saving");
    try {
      const res = await fetch(`/api/notes/${activeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          contentJson: JSON.stringify(editor.getJSON()),
          contentText: editor.getText(),
        }),
      });
      if (res.ok) {
        dirtyRef.current = false;
        setSaveState("saved");
        fetchList(searchQuery || undefined);
      } else {
        setSaveState("error");
      }
    } catch {
      setSaveState("error");
    }
  }, [activeId, editor, title, searchQuery, fetchList]);

  // 防抖保存
  const debounceSave = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => saveNote(), 800);
  }, [saveNote]);

  // 页面失焦时立即保存
  useEffect(() => {
    const handleBlur = () => {
      if (dirtyRef.current) saveNote();
    };
    window.addEventListener("blur", handleBlur);
    return () => window.removeEventListener("blur", handleBlur);
  }, [saveNote]);

  // 初始化加载
  useEffect(() => {
    (async () => {
      await fetchList();
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 切换笔记
  const switchNote = async (id: string) => {
    if (id === activeId) return;
    if (dirtyRef.current) await saveNote();
    setActiveId(id);
    await fetchNote(id);
  };

  // 新建笔记
  const createNote = async () => {
    if (dirtyRef.current) await saveNote();
    const res = await fetch("/api/notes", { method: "POST" });
    if (res.ok) {
      const note = await res.json();
      const list = await fetchList();
      setActiveId(note.id);
      await fetchNote(note.id);
      if (list.length === 0) setNotesList([note]);
      return;
    }

    if (res.status === 401) {
      router.push("/login");
    }
  };

  // 删除笔记
  const deleteNote = async (id: string) => {
    const res = await fetch(`/api/notes/${id}`, { method: "DELETE" });
    if (res.ok) {
      await fetchList(searchQuery || undefined);
      setActiveId(null);
      setActiveNote(null);
      setTitle("");
      editor?.commands.setContent("", { emitUpdate: false });
      setPendingDelete(null);
    }
  };

  // 搜索
  const handleSearch = (q: string) => {
    setSearchQuery(q);
    fetchList(q || undefined);
  };

  // 标题变更触发保存
  const handleTitleChange = (val: string) => {
    setTitle(val);
    dirtyRef.current = true;
    setSaveState("dirty");
    debounceSave();
  };

  const saveLabel = {
    saved: "● 已保存",
    saving: "◌ 保存中",
    dirty: "○ 未保存",
    error: "✕ 保存失败",
  };

  const formatDate = (d: string) => {
    const date = new Date(d);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return "刚刚";
    if (diffMin < 60) return `${diffMin} 分钟前`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr} 小时前`;
    return date.toLocaleDateString("zh-CN", { month: "short", day: "numeric" });
  };

  if (loading) {
    return (
      <div className={styles.loading}>
        <div className={styles.loadingInner}>
          <span className={styles.loadingIcon}>⊹</span>
          <p>载入笔记...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {/* 侧边栏 */}
      <aside className={`${styles.sidebar} ${sidebarCollapsed ? styles.collapsed : ""}`}>
        <div className={styles.sidebarHead}>
          <Link className={styles.backLink} href="/">← Pixelverse</Link>
          <button
            className={styles.collapseBtn}
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            title={sidebarCollapsed ? "展开" : "收起"}
          >
            {sidebarCollapsed ? "»" : "«"}
          </button>
        </div>

        {!sidebarCollapsed && (
          <>
            <div className={styles.sidebarActions}>
              <button className={styles.newBtn} onClick={createNote}>
                + 新建笔记
              </button>
              <div className={styles.searchWrap}>
                <span className={styles.searchIcon}>⌕</span>
                <input
                  className={styles.search}
                  type="text"
                  placeholder="搜索..."
                  value={searchQuery}
                  onChange={(e) => handleSearch(e.target.value)}
                />
              </div>
            </div>

            <div className={styles.listHead}>
              <span className={styles.listCount}>
                {notesList.length} 篇笔记
              </span>
            </div>

            <div className={styles.list}>
              {notesList.length === 0 ? (
                <div className={styles.empty}>
                  <span className={styles.emptyIcon}>✎</span>
                  <p>{searchQuery ? "没有搜到相关笔记" : "还没有笔记"}</p>
                  {!searchQuery && (
                    <button className={styles.emptyBtn} onClick={createNote}>
                      新建第一篇
                    </button>
                  )}
                </div>
              ) : (
                notesList.map((n) => (
                  <button
                    key={n.id}
                    className={`${styles.listItem} ${n.id === activeId ? styles.active : ""}`}
                    onClick={() => switchNote(n.id)}
                  >
                    <span className={styles.itemTitle}>
                      {n.title || "无标题"}
                    </span>
                    <span className={styles.itemExcerpt}>
                      {n.excerpt || "空白笔记"}
                    </span>
                    <span className={styles.itemTime}>
                      {formatDate(n.updatedAt)}
                    </span>
                  </button>
                ))
              )}
            </div>
          </>
        )}
      </aside>

      {/* 编辑区 */}
      <main className={styles.editor}>
        {activeNote ? (
          <>
            <div className={styles.editorTop}>
              <input
                className={styles.titleInput}
                value={title}
                onChange={(e) => handleTitleChange(e.target.value)}
                placeholder="笔记标题"
              />
              <div className={styles.editorMeta}>
                <span className={`${styles.saveState} ${styles[saveState]}`}>
                  {saveLabel[saveState]}
                </span>
                <span className={styles.charCount}>
                  {charCount} 字
                </span>
                <button
                  className={styles.deleteBtn}
                  onClick={() => setPendingDelete(activeNote)}
                >
                  删除
                </button>
              </div>
            </div>
            <Toolbar editor={editor} onImageUpload={handleImageUpload} />
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp"
              onChange={handleFileSelect}
              style={{ display: "none" }}
            />
            <div className={styles.editorBody}>
              <EditorContent editor={editor} />
            </div>
            <div className={styles.editorFooter}>
              <span className={styles.footerTime}>
                最后编辑：{formatDate(activeNote.updatedAt)}
              </span>
            </div>
          </>
        ) : (
          <div className={styles.emptyEditor}>
            <div className={styles.emptyEditorInner}>
              <span className={styles.emptyEditorIcon}>☁</span>
              <h3>Cloud Notes</h3>
              <p>选择一篇笔记，或新建一篇开始记录</p>
              <button className={styles.emptyEditorBtn} onClick={createNote}>
                + 新建笔记
              </button>
            </div>
          </div>
        )}
      </main>

      {pendingDelete ? (
        <div className={styles.modalLayer} role="presentation">
          <div
            className={styles.modalBackdrop}
            onClick={() => setPendingDelete(null)}
          />
          <div
            className={styles.modal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-note-title"
          >
            <span className={styles.modalTag}>Danger Zone</span>
            <h3 id="delete-note-title">删除这篇笔记？</h3>
            <p>
              这会把“{pendingDelete.title || "无标题笔记"}”移出当前列表。
              删除后不会自动帮你恢复。
            </p>
            <div className={styles.modalActions}>
              <button
                className={styles.modalCancel}
                onClick={() => setPendingDelete(null)}
                type="button"
              >
                取消
              </button>
              <button
                className={styles.modalConfirm}
                onClick={() => deleteNote(pendingDelete.id)}
                type="button"
              >
                确认删除
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
