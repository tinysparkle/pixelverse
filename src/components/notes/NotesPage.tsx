"use client";

import { Fragment, useState, useCallback, useEffect, useRef, type CSSProperties } from "react";
import Link from "next/link";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import TiptapLink from "@tiptap/extension-link";
import { useRouter } from "next/navigation";
import { Menu, Plus, Search, Trash2, X, ImagePlus, ZoomIn, ZoomOut, ChevronLeft, ChevronRight, Copy, FileText, LoaderCircle } from "lucide-react";
import { PhotoSlider } from "react-photo-view";
import "react-photo-view/dist/react-photo-view.css";
import styles from "./notes.module.css";
import {
  recognizeImageText,
  terminateOcrWorker,
  type OcrRecognitionResult,
} from "./ocrUtils";
import { ResizableImage } from "./ResizableImage";
import {
  extractImageViewerItems,
  findImageViewerIndex,
  formatUrlDisplayText,
  type ImageViewerItem,
  isPureUrlText,
  resolveInitialImageWidth,
} from "./editorUtils";
import {
  DEFAULT_TOOLBAR_BUTTON_IDS,
  TOOLBAR_BUTTON_REGISTRY,
  TOOLBAR_STORAGE_KEY,
  type ToolbarButtonId,
  sanitizeToolbarButtonIds,
} from "./toolbarConfig";

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

interface DeletedNoteItem {
  id: string;
  title: string;
  excerpt: string;
  deletedAt: string;
  updatedAt: string;
}

type OcrStatus = "idle" | "loading" | "ready" | "error";

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
function Toolbar({
  editor,
  onImageUpload,
  selectedButtonIds,
  onToggleSettings,
  settingsOpen,
  onButtonToggle,
}: {
  editor: Editor | null;
  onImageUpload: () => void;
  selectedButtonIds: ToolbarButtonId[];
  onToggleSettings: () => void;
  settingsOpen: boolean;
  onButtonToggle: (id: ToolbarButtonId, checked: boolean) => void;
}) {
  if (!editor) return null;

  const e = editor;
  const selectedSet = new Set(selectedButtonIds);

  const buttonActions: Record<ToolbarButtonId, { action: () => void; active: boolean }> = {
    undo: {
      action: () => e.chain().focus().undo().run(),
      active: false,
    },
    redo: {
      action: () => e.chain().focus().redo().run(),
      active: false,
    },
    bold: {
      action: () => e.chain().focus().toggleBold().run(),
      active: e.isActive("bold"),
    },
    italic: {
      action: () => e.chain().focus().toggleItalic().run(),
      active: e.isActive("italic"),
    },
    strike: {
      action: () => e.chain().focus().toggleStrike().run(),
      active: e.isActive("strike"),
    },
    code: {
      action: () => e.chain().focus().toggleCode().run(),
      active: e.isActive("code"),
    },
    codeBlock: {
      action: () => e.chain().focus().toggleCodeBlock().run(),
      active: e.isActive("codeBlock"),
    },
    heading1: {
      action: () => e.chain().focus().toggleHeading({ level: 1 }).run(),
      active: e.isActive("heading", { level: 1 }),
    },
    heading2: {
      action: () => e.chain().focus().toggleHeading({ level: 2 }).run(),
      active: e.isActive("heading", { level: 2 }),
    },
    heading3: {
      action: () => e.chain().focus().toggleHeading({ level: 3 }).run(),
      active: e.isActive("heading", { level: 3 }),
    },
    bulletList: {
      action: () => e.chain().focus().toggleBulletList().run(),
      active: e.isActive("bulletList"),
    },
    orderedList: {
      action: () => e.chain().focus().toggleOrderedList().run(),
      active: e.isActive("orderedList"),
    },
    blockquote: {
      action: () => e.chain().focus().toggleBlockquote().run(),
      active: e.isActive("blockquote"),
    },
    horizontalRule: {
      action: () => e.chain().focus().setHorizontalRule().run(),
      active: false,
    },
    link: {
      action: () => {
        const currentHref = e.getAttributes("link").href as string | undefined;
        const input = window.prompt("输入链接 URL", currentHref ?? "https://");
        if (!input) return;
        const href = input.trim();
        if (!href) return;
        e.chain().focus().setLink({ href }).run();
      },
      active: e.isActive("link"),
    },
    unlink: {
      action: () => e.chain().focus().unsetLink().run(),
      active: false,
    },
    image: {
      action: onImageUpload,
      active: false,
    },
  };

  const groupedItems = TOOLBAR_BUTTON_REGISTRY.reduce<Record<string, typeof TOOLBAR_BUTTON_REGISTRY>>((acc, item) => {
    if (!selectedSet.has(item.id)) return acc;
    if (!acc[item.group]) acc[item.group] = [];
    acc[item.group].push(item);
    return acc;
  }, {});

  const orderedGroups = ["history", "inline", "heading", "block", "link", "media"] as const;

  return (
    <div className={styles.toolbarWrap}>
      <div className={styles.toolbar}>
        {orderedGroups.map((group) => {
          const items = groupedItems[group] ?? [];
          if (!items.length) return null;
          return (
            <Fragment key={group}>
              <div className={styles.tbGroup}>
                {items.map((item) => {
                  const renderLabel = item.id === "image"
                    ? <ImagePlus size={16} strokeWidth={2.2} />
                    : item.label;

                  return (
                    <button
                      key={item.id}
                      className={`${styles.tbBtn} ${buttonActions[item.id].active ? styles.tbActive : ""}`}
                      onClick={buttonActions[item.id].action}
                      title={item.shortcut ? `${item.title} (${item.shortcut})` : item.title}
                      type="button"
                    >
                      {renderLabel}
                    </button>
                  );
                })}
              </div>
              <span className={styles.tbDivider} />
            </Fragment>
          );
        })}
        <button
          type="button"
          className={`${styles.tbBtn} ${styles.toolbarSettingsBtn}`}
          onClick={onToggleSettings}
          title="自定义工具栏"
          aria-expanded={settingsOpen}
        >
          ⚙ 工具
        </button>
      </div>

      {settingsOpen ? (
        <div className={styles.toolbarSettingsPanel}>
          <p className={styles.toolbarSettingsTitle}>选择要显示的工具按钮</p>
          <div className={styles.toolbarSettingsGrid}>
            {TOOLBAR_BUTTON_REGISTRY.map((item) => (
              <label key={item.id} className={styles.toolbarOption}>
                <input
                  type="checkbox"
                  checked={selectedSet.has(item.id)}
                  onChange={(event) => onButtonToggle(item.id, event.target.checked)}
                />
                <span>{item.title}</span>
              </label>
            ))}
          </div>
        </div>
      ) : null}
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
  const [sidebarWidth, setSidebarWidth] = useState(280);
  const [viewMode, setViewMode] = useState<"notes" | "trash">("notes");
  const [trashList, setTrashList] = useState<DeletedNoteItem[]>([]);
  const [trashLoading, setTrashLoading] = useState(false);
  const [pendingPermanentDelete, setPendingPermanentDelete] = useState<DeletedNoteItem | null>(null);
  const [pendingEmptyTrash, setPendingEmptyTrash] = useState(false);
  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewerImages, setViewerImages] = useState<ImageViewerItem[]>([]);
  const [viewerIndex, setViewerIndex] = useState(0);
  const [ocrStatus, setOcrStatus] = useState<OcrStatus>("idle");
  const [ocrResult, setOcrResult] = useState<OcrRecognitionResult | null>(null);
  const [ocrPanelOpen, setOcrPanelOpen] = useState(false);
  const [ocrError, setOcrError] = useState("");
  const [isMobile, setIsMobile] = useState(false);
  const [mobileListOpen, setMobileListOpen] = useState(false);
  const [toolbarButtonIds, setToolbarButtonIds] = useState<ToolbarButtonId[]>([...DEFAULT_TOOLBAR_BUTTON_IDS]);
  const [toolbarSettingsOpen, setToolbarSettingsOpen] = useState(false);
  const isResizing = useRef(false);
  const resizeStartX = useRef(0);
  const resizeStartWidth = useRef(280);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirtyRef = useRef(false);
  const activeIdRef = useRef<string | null>(null);
  const ocrJobRef = useRef(0);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── 关键修复：用 ref 保存最新的 saveNote，打破闭包链 ──
  const saveNoteRef = useRef<() => Promise<void>>(async () => {});

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: "开始记录你的想法..." }),
      TiptapLink.configure({
        autolink: true,
        linkOnPaste: false,
        openOnClick: true,
      }),
      ResizableImage.configure({ inline: false, allowBase64: false }),
    ],
    // 关键修复：onUpdate 通过 ref 调用 saveNote，永远是最新的
    onUpdate: () => {
      dirtyRef.current = true;
      setSaveState("dirty");
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => saveNoteRef.current(), 800);
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
                  const initialWidth = resolveInitialImageWidth(editorBodyRef.current?.clientWidth);
                  editor.chain().focus().setImage({ src: url, width: initialWidth }).run();
                }
              });
            }
            return true;
          }
        }

        const pastedText = event.clipboardData?.getData("text/plain") ?? "";
        if (editor && isPureUrlText(pastedText)) {
          event.preventDefault();
          const href = pastedText.trim();
          const label = formatUrlDisplayText(href);
          editor
            .chain()
            .focus()
            .insertContent({
              type: "text",
              text: label,
              marks: [{ type: "link", attrs: { href } }],
            })
            .insertContent(" ")
            .run();
          return true;
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
                const initialWidth = resolveInitialImageWidth(editorBodyRef.current?.clientWidth);
                editor.chain().focus().setImage({ src: url, width: initialWidth }).run();
              }
            });
            return true;
          }
        }
        return false;
      },
      handleClick: (_view, _pos, event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) return false;
        if (target.closest(".resize-handle")) return false;

        const imageElement = target.tagName === "IMG"
          ? target
          : target.closest("img");

        if (!imageElement) return false;

        const src = imageElement.getAttribute("src");
        if (!src) return false;

        event.preventDefault();
        (document.activeElement as HTMLElement | null)?.blur?.();
        const images = extractImageViewerItems(editor?.getJSON());
        if (!images.length) return true;
        setViewerImages(images);
        setViewerIndex(findImageViewerIndex(images, src));
        setViewerVisible(true);
        return true;
      },
    },
  });

  const currentViewerImage = viewerImages[viewerIndex] ?? null;

  useEffect(() => {
    if (!viewerVisible || !currentViewerImage?.src) {
      setOcrStatus("idle");
      setOcrResult(null);
      setOcrError("");
      setOcrPanelOpen(false);
      return;
    }

    const jobId = ++ocrJobRef.current;
    setOcrStatus("loading");
    setOcrResult(null);
    setOcrError("");
    setOcrPanelOpen(false);

    recognizeImageText(currentViewerImage.src)
      .then((result) => {
        if (ocrJobRef.current !== jobId) return;
        setOcrResult(result);
        setOcrStatus("ready");
      })
      .catch((error: unknown) => {
        if (ocrJobRef.current !== jobId) return;
        setOcrError(error instanceof Error ? error.message : "识别失败，请稍后重试");
        setOcrStatus("error");
      });
  }, [currentViewerImage?.src, viewerVisible]);

  useEffect(() => {
    return () => {
      void terminateOcrWorker();
    };
  }, []);

  const stopOcrSelectionGesture = useCallback((event: { stopPropagation: () => void }) => {
    event.stopPropagation();
  }, []);

  // 图片上传按钮处理
  const handleImageUpload = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !editor) return;
    const url = await uploadImage(file);
    if (url) {
      const initialWidth = resolveInitialImageWidth(editorBodyRef.current?.clientWidth);
      editor.chain().focus().setImage({ src: url, width: initialWidth }).run();
    }
    e.target.value = "";
  }, [editor]);

  // 字数统计
  const charCount = editor?.storage.characterCount?.characters?.() ?? editor?.getText().length ?? 0;

  // 拉取笔记列表
  const fetchList = useCallback(async (query?: string) => {
    const url = query ? `/api/notes?query=${encodeURIComponent(query)}` : "/api/notes";
    try {
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setNotesList(data);
        return data as NoteItem[];
      }
      if (res.status === 401) {
        router.push("/login");
      }
    } catch { /* 网络异常 */ }
    return [];
  }, [router]);

  // 编辑器同步 activeNote 内容
  useEffect(() => {
    if (!editor) return;

    const frame = window.requestAnimationFrame(() => {
      if (!activeNote) {
        editor.commands.setContent("", { emitUpdate: false });
        return;
      }

      if (activeNote.contentJson) {
        editor.commands.setContent(JSON.parse(activeNote.contentJson), { emitUpdate: false });
      } else {
        editor.commands.setContent("", { emitUpdate: false });
      }
    });

    dirtyRef.current = false;
    setSaveState("saved");
    return () => window.cancelAnimationFrame(frame);
  }, [editor, activeNote]);

  // 保存当前笔记
  const saveNote = useCallback(async () => {
    const currentId = activeIdRef.current;
    if (!currentId || !editor || !dirtyRef.current) return;

    setSaveState("saving");
    try {
      const res = await fetch(`/api/notes/${currentId}`, {
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
  }, [editor, title, searchQuery, fetchList]);

  // 关键修复：每次 saveNote 更新后同步到 ref
  useEffect(() => { saveNoteRef.current = saveNote; }, [saveNote]);

  // 页面失焦时立即保存
  useEffect(() => {
    const handleBlur = () => {
      if (dirtyRef.current) saveNoteRef.current();
    };
    window.addEventListener("blur", handleBlur);
    return () => window.removeEventListener("blur", handleBlur);
  }, []);

  // 初始化加载
  useEffect(() => {
    (async () => {
      await fetchList();
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 768px)");
    const apply = () => {
      const next = mq.matches;
      setIsMobile(next);
      if (!next) setMobileListOpen(false);
    };
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    const raw = window.localStorage.getItem(TOOLBAR_STORAGE_KEY);
    if (!raw) {
      setToolbarButtonIds([...DEFAULT_TOOLBAR_BUTTON_IDS]);
      return;
    }

    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        setToolbarButtonIds([...DEFAULT_TOOLBAR_BUTTON_IDS]);
        return;
      }

      const sanitized = sanitizeToolbarButtonIds(parsed.map((item) => String(item)));
      setToolbarButtonIds(sanitized);
    } catch {
      setToolbarButtonIds([...DEFAULT_TOOLBAR_BUTTON_IDS]);
    }
  }, []);

  useEffect(() => {
    if (isMobile) setSidebarCollapsed(false);
  }, [isMobile]);

  const handleToolbarButtonToggle = useCallback((id: ToolbarButtonId, checked: boolean) => {
    setToolbarButtonIds((previous) => {
      const nextCandidate = checked
        ? [...previous, id]
        : previous.filter((item) => item !== id);

      const sanitized = sanitizeToolbarButtonIds(nextCandidate);
      window.localStorage.setItem(TOOLBAR_STORAGE_KEY, JSON.stringify(sanitized));
      return sanitized;
    });
  }, []);

  // 关键修复：切换笔记 — 内联 fetch，加容错
  const switchNote = async (id: string) => {
    if (id === activeId) {
      setMobileListOpen(false);
      return;
    }
    if (dirtyRef.current && activeIdRef.current) await saveNoteRef.current();
    setActiveId(id);
    activeIdRef.current = id;
    try {
      const res = await fetch(`/api/notes/${id}`);
      if (res.ok) {
        const data: NoteDetail = await res.json();
        setActiveNote(data);
        setTitle(data.title);
        dirtyRef.current = false;
        setSaveState("saved");
      } else if (res.status === 401) {
        router.push("/login");
      }
    } catch { /* 网络异常 */ }
    setMobileListOpen(false);
  };

  // 关键修复：新建笔记 — 直接用 POST 响应设置 activeNote，不做二次 fetch
  const createNote = async () => {
    if (dirtyRef.current && activeIdRef.current) await saveNoteRef.current();
    try {
      const res = await fetch("/api/notes", { method: "POST" });
      if (res.ok) {
        const note = await res.json();
        setActiveId(note.id);
        activeIdRef.current = note.id;
        setActiveNote({
          id: note.id,
          title: note.title,
          contentJson: note.contentJson,
          contentText: note.contentText,
          updatedAt: note.updatedAt,
        });
        setTitle(note.title);
        dirtyRef.current = false;
        setSaveState("saved");
        fetchList(searchQuery || undefined);
        setMobileListOpen(false);
        return;
      }
      if (res.status === 401) {
        router.push("/login");
      }
    } catch { /* 网络异常 */ }
  };

  // 删除笔记
  const deleteNote = async (id: string) => {
    try {
      const res = await fetch(`/api/notes/${id}`, { method: "DELETE" });
      if (res.ok) {
        await fetchList(searchQuery || undefined);
        setActiveId(null);
        activeIdRef.current = null;
        setActiveNote(null);
        setTitle("");
        editor?.commands.setContent("", { emitUpdate: false });
        setPendingDelete(null);
      }
    } catch { /* 网络异常 */ }
  };

  // 搜索
  const handleSearch = (q: string) => {
    setSearchQuery(q);
    fetchList(q || undefined);
  };

  // ── 废纸篓操作 ──
  const fetchTrash = useCallback(async () => {
    setTrashLoading(true);
    try {
      const res = await fetch("/api/notes/trash");
      if (res.ok) {
        const data = await res.json();
        setTrashList(data);
      } else if (res.status === 401) {
        router.push("/login");
      }
    } catch { /* 网络异常 */ }
    setTrashLoading(false);
  }, [router]);

  const switchToTrash = async () => {
    if (dirtyRef.current && activeIdRef.current) await saveNoteRef.current();
    setViewMode("trash");
    setActiveId(null);
    activeIdRef.current = null;
    setActiveNote(null);
    setTitle("");
    editor?.commands.setContent("", { emitUpdate: false });
    fetchTrash();
  };

  const switchToNotes = () => {
    setViewMode("notes");
    setTrashList([]);
    fetchList(searchQuery || undefined);
  };

  const restoreNote = async (id: string) => {
    try {
      const res = await fetch(`/api/notes/${id}/restore`, { method: "POST" });
      if (res.ok) {
        fetchTrash();
      }
    } catch { /* 网络异常 */ }
  };

  const permanentDeleteNote = async (id: string) => {
    try {
      const res = await fetch(`/api/notes/${id}/permanent`, { method: "DELETE" });
      if (res.ok) {
        fetchTrash();
        setPendingPermanentDelete(null);
      }
    } catch { /* 网络异常 */ }
  };

  const emptyTrash = async () => {
    await Promise.allSettled(
      trashList.map(item =>
        fetch(`/api/notes/${item.id}/permanent`, { method: "DELETE" })
      )
    );
    setPendingEmptyTrash(false);
    fetchTrash();
  };

  const daysUntilPurge = (deletedAt: string) => {
    const deleted = new Date(deletedAt);
    const expiry = new Date(deleted.getTime() + 30 * 24 * 60 * 60 * 1000);
    return Math.max(0, Math.ceil((expiry.getTime() - Date.now()) / (24 * 60 * 60 * 1000)));
  };

  // 标题变更触发保存 — 通过 ref 防抖
  const handleTitleChange = (val: string) => {
    setTitle(val);
    dirtyRef.current = true;
    setSaveState("dirty");
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => saveNoteRef.current(), 800);
  };

  const saveLabel = {
    saved: "● 已保存",
    saving: "◌ 保存中",
    dirty: "○ 未保存",
    error: "✕ 保存失败",
  };

  // ── 拖拽调整侧边栏宽度 ──
  const containerRef = useRef<HTMLDivElement>(null);
  const editorBodyRef = useRef<HTMLDivElement>(null);

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isResizing.current = true;
    resizeStartX.current = e.clientX;
    resizeStartWidth.current = sidebarWidth;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    // 拖拽期间禁用过渡，避免延迟跟手
    containerRef.current?.style.setProperty("transition", "none");
  }, [sidebarWidth]);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!isResizing.current) return;
      const delta = e.clientX - resizeStartX.current;
      const newWidth = Math.min(500, Math.max(200, resizeStartWidth.current + delta));
      setSidebarWidth(newWidth);
    };
    const onMouseUp = () => {
      if (!isResizing.current) return;
      isResizing.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      // 松手后恢复过渡（用于折叠动画）
      containerRef.current?.style.removeProperty("transition");
    };
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

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

  const containerClassName = [
    styles.container,
    sidebarCollapsed ? styles.containerCollapsed : styles.containerExpanded,
    isMobile && mobileListOpen ? styles.mobileDrawerOpen : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      ref={containerRef}
      className={containerClassName}
      style={{ "--sidebar-width": `${sidebarWidth}px` } as CSSProperties}
    >
      {isMobile && mobileListOpen ? (
        <button
          type="button"
          className={styles.drawerBackdrop}
          onClick={() => setMobileListOpen(false)}
          aria-label="关闭笔记列表"
        />
      ) : null}

      {/* 侧边栏 */}
      <aside
        className={`${styles.sidebar} ${sidebarCollapsed && !isMobile ? styles.collapsed : ""}`}
        role={isMobile && mobileListOpen ? "dialog" : undefined}
        aria-modal={isMobile && mobileListOpen ? true : undefined}
        aria-label={isMobile ? "笔记列表" : undefined}
      >
        <div className={styles.sidebarHead}>
          <Link className={styles.backLink} href="/">← Pixelverse</Link>
          {isMobile ? (
            <button
              type="button"
              className={styles.drawerCloseBtn}
              onClick={() => setMobileListOpen(false)}
              aria-label="关闭笔记列表"
            >
              <X size={16} strokeWidth={2.2} />
            </button>
          ) : (
            <button
              className={styles.collapseBtn}
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              title={sidebarCollapsed ? "展开" : "收起"}
              type="button"
            >
              {sidebarCollapsed ? "»" : "«"}
            </button>
          )}
        </div>

        {!sidebarCollapsed && (
          <>
            {viewMode === "notes" && (
              <>
                <div className={styles.sidebarActions}>
                  <button className={styles.newBtn} onClick={createNote}>
                    <Plus size={15} strokeWidth={2.2} />
                    <span>新建笔记</span>
                  </button>
                  <div className={styles.searchWrap}>
                    <span className={styles.searchIcon} aria-hidden="true">
                      <Search size={14} strokeWidth={2.2} />
                    </span>
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

            {viewMode === "trash" && (
              <>
                <div className={styles.listHead}>
                  <span className={styles.listCount}>废纸篓</span>
                </div>
                <div className={styles.list}>
                  {trashList.length === 0 ? (
                    <div className={styles.empty}>
                      <span className={styles.emptyIcon}>🗑</span>
                      <p>废纸篓是空的</p>
                    </div>
                  ) : (
                    trashList.map((n) => (
                      <div key={n.id} className={styles.listItem}>
                        <span className={styles.itemTitle}>
                          {n.title || "无标题"}
                        </span>
                        <span className={styles.itemExcerpt}>
                          {n.excerpt || "空白笔记"}
                        </span>
                        <span className={styles.itemTime}>
                          {daysUntilPurge(n.deletedAt)}天后自动删除
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </>
            )}

            <div className={styles.trashDivider} />
            <button
              className={`${styles.trashBtn} ${viewMode === "trash" ? styles.trashActive : ""}`}
              onClick={viewMode === "trash" ? switchToNotes : switchToTrash}
            >
              <span className={styles.trashBtnLabel}>
                <Trash2 size={14} strokeWidth={2.2} />
                <span>{viewMode === "trash" ? "返回笔记" : "废纸篓"}</span>
              </span>
              {viewMode === "notes" && trashList.length > 0 && (
                <span className={styles.trashBadge}>{trashList.length}</span>
              )}
            </button>
          </>
        )}
      </aside>

      {/* 拖拽分割条 */}
      {!sidebarCollapsed && (
        <div className={styles.resizer} onMouseDown={handleResizeStart} />
      )}

      {/* 编辑区 */}
      <main className={styles.editor}>
        {viewMode === "trash" ? (
          <div className={styles.trashView}>
            <div className={styles.trashHeader}>
              <div className={styles.trashHeaderMain}>
                {isMobile ? (
                  <button
                    type="button"
                    className={styles.mobileListBtn}
                    onClick={() => setMobileListOpen(true)}
                    aria-label="打开笔记列表"
                  >
                    <Menu size={15} strokeWidth={2.2} />
                    <span>列表</span>
                  </button>
                ) : null}
                <div>
                  <h2 className={styles.trashTitle}>废纸篓</h2>
                  <p className={styles.trashSubtitle}>
                    {trashList.length} 篇已删除笔记 · 30天后自动永久删除
                  </p>
                </div>
              </div>
              {trashList.length > 0 && (
                <button
                  className={styles.emptyTrashBtn}
                  onClick={() => setPendingEmptyTrash(true)}
                >
                  清空废纸篓
                </button>
              )}
            </div>
            {trashLoading ? (
              <div className={styles.loading}>
                <div className={styles.loadingInner}>
                  <span className={styles.loadingIcon}>⊹</span>
                  <p>载入废纸篓...</p>
                </div>
              </div>
            ) : trashList.length === 0 ? (
              <div className={styles.emptyEditor}>
                <div className={styles.emptyEditorInner}>
                  <span className={styles.emptyEditorIcon}>🗑</span>
                  <h3>Trash is Empty</h3>
                  <p>删除的笔记会在这里保留30天</p>
                </div>
              </div>
            ) : (
              <div className={styles.trashItems}>
                {trashList.map(item => (
                  <div key={item.id} className={styles.trashItem}>
                    <div className={styles.trashItemInfo}>
                      <span className={styles.trashItemTitle}>{item.title || "无标题"}</span>
                      <span className={styles.trashItemExcerpt}>{item.excerpt || "空白笔记"}</span>
                      <div className={styles.trashItemMeta}>
                        <span className={styles.trashItemDate}>
                          删除于 {new Date(item.deletedAt).toLocaleDateString("zh-CN")}
                        </span>
                        <span className={styles.trashCountdown}>
                          {daysUntilPurge(item.deletedAt)}天后自动删除
                        </span>
                      </div>
                    </div>
                    <div className={styles.trashItemActions}>
                      <button className={styles.restoreBtn} onClick={() => restoreNote(item.id)}>
                        恢复
                      </button>
                      <button
                        className={styles.permDeleteBtn}
                        onClick={() => setPendingPermanentDelete(item)}
                      >
                        永久删除
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : activeNote ? (
          <>
            <div className={styles.editorTop}>
              <div className={styles.editorTopMain}>
                {isMobile ? (
                  <button
                    type="button"
                    className={styles.mobileListBtn}
                    onClick={() => setMobileListOpen(true)}
                    aria-label="打开笔记列表"
                  >
                    <Menu size={15} strokeWidth={2.2} />
                    <span>笔记</span>
                  </button>
                ) : null}
                <input
                  className={styles.titleInput}
                  value={title}
                  onChange={(e) => handleTitleChange(e.target.value)}
                  placeholder="笔记标题"
                />
              </div>
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
            <Toolbar
              editor={editor}
              onImageUpload={handleImageUpload}
              selectedButtonIds={toolbarButtonIds}
              settingsOpen={toolbarSettingsOpen}
              onToggleSettings={() => setToolbarSettingsOpen((open) => !open)}
              onButtonToggle={handleToolbarButtonToggle}
            />
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp"
              onChange={handleFileSelect}
              style={{ display: "none" }}
            />
            <div ref={editorBodyRef} className={styles.editorBody}>
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
              {isMobile ? (
                <button
                  type="button"
                  className={styles.mobileListBtn}
                  onClick={() => setMobileListOpen(true)}
                  aria-label="打开笔记列表"
                >
                  <Menu size={15} strokeWidth={2.2} />
                  <span>笔记列表</span>
                </button>
              ) : null}
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

      <PhotoSlider
        images={viewerImages.map((image) => ({
          ...image,
          render: ({ attrs }: { attrs: Record<string, unknown> }) => {
            const isCurrent = currentViewerImage?.src === image.src;
            const overlayWords = isCurrent && ocrStatus === "ready" ? (ocrResult?.words ?? []) : [];

            return (
              <div
                {...attrs}
                className={`${styles.ocrPhotoStage} ${attrs.className ?? ""}`}
              >
                <img
                  className={styles.ocrPhotoImage}
                  src={image.src}
                  alt="图片预览"
                  draggable={false}
                />
                {overlayWords.length > 0 ? (
                  <div className={styles.ocrTextLayer} aria-label="可复制文字层">
                    {overlayWords.map((word) => (
                      <span
                        key={word.id}
                        className={styles.ocrWord}
                        onMouseDownCapture={stopOcrSelectionGesture}
                        onPointerDownCapture={stopOcrSelectionGesture}
                        onTouchStartCapture={stopOcrSelectionGesture}
                        style={{
                          left: `${word.leftPct}%`,
                          top: `${word.topPct}%`,
                          width: `${word.widthPct}%`,
                          minHeight: `${word.heightPct}%`,
                          fontSize: `${Math.max(word.heightPct * 0.85, 1.2)}%`,
                        }}
                      >
                        {word.text}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          },
        }))}
        index={viewerIndex}
        visible={viewerVisible}
        onIndexChange={setViewerIndex}
        onClose={() => {
          setViewerVisible(false);
          setOcrPanelOpen(false);
        }}
        maskOpacity={0.92}
        pullClosable
        maskClosable
        photoClosable={false}
        bannerVisible={false}
        className={styles.photoViewer}
        maskClassName={styles.photoViewerMask}
        photoWrapClassName={styles.photoViewerWrap}
        photoClassName={styles.photoViewerImage}
        overlayRender={({ index, images, onClose, onIndexChange, onScale, scale }) => (
          <div className={styles.photoViewerOverlay}>
            <div className={styles.photoViewerToolbar}>
              <div className={styles.photoViewerCounter}>
                <span>{index + 1} / {images.length}</span>
              </div>
              <div className={styles.photoViewerActions}>
                {images.length > 1 ? (
                  <>
                    <button
                      type="button"
                      className={styles.photoViewerActionBtn}
                      onClick={() => onIndexChange(index === 0 ? images.length - 1 : index - 1)}
                      aria-label="上一张图片"
                      title="上一张图片"
                    >
                      <ChevronLeft size={18} strokeWidth={2.2} />
                    </button>
                    <button
                      type="button"
                      className={styles.photoViewerActionBtn}
                      onClick={() => onIndexChange(index === images.length - 1 ? 0 : index + 1)}
                      aria-label="下一张图片"
                      title="下一张图片"
                    >
                      <ChevronRight size={18} strokeWidth={2.2} />
                    </button>
                  </>
                ) : null}
                <button
                  type="button"
                  className={styles.photoViewerActionBtn}
                  onClick={() => onScale(Math.max(1, scale - 0.35))}
                  aria-label="缩小图片"
                  title="缩小图片"
                >
                  <ZoomOut size={18} strokeWidth={2.2} />
                </button>
                <button
                  type="button"
                  className={styles.photoViewerActionBtn}
                  onClick={() => onScale(scale + 0.35)}
                  aria-label="放大图片"
                  title="放大图片"
                >
                  <ZoomIn size={18} strokeWidth={2.2} />
                </button>
                <button
                  type="button"
                  className={styles.photoViewerActionBtn}
                  onClick={onClose}
                  aria-label="关闭预览"
                  title="关闭预览"
                >
                  <X size={18} strokeWidth={2.2} />
                </button>
                <button
                  type="button"
                  className={styles.photoViewerActionBtn}
                  onClick={() => setOcrPanelOpen((open) => !open)}
                  aria-label="切换识别文本面板"
                  title={ocrPanelOpen ? "隐藏识别文本面板" : "显示识别文本面板"}
                >
                  <FileText size={18} strokeWidth={2.2} />
                </button>
              </div>
            </div>
            <p className={styles.previewHint}>
              {ocrStatus === "loading"
                ? "正在自动识别图片文字，完成后可直接框选复制。"
                : ocrStatus === "error"
                  ? ocrError || "文字识别失败，可继续查看图片。"
                  : "OCR 完成后可直接框选复制；移动端若不便选择，可打开文本面板或复制全部文字。"}
            </p>
            {ocrPanelOpen ? (
              <div className={styles.ocrPanel}>
                <div className={styles.ocrPanelHead}>
                  <span>识别文本</span>
                </div>
                <div className={styles.ocrPanelBody}>
                  {ocrStatus === "loading" ? (
                    <div className={styles.ocrPanelEmpty}>
                      <LoaderCircle size={16} className={styles.ocrSpinner} strokeWidth={2.2} />
                      <span>正在识别文字...</span>
                    </div>
                  ) : ocrStatus === "error" ? (
                    <div className={styles.ocrPanelEmpty}>{ocrError || "识别失败"}</div>
                  ) : ocrResult?.text ? (
                    <pre className={styles.ocrPanelText}>{ocrResult.text}</pre>
                  ) : (
                    <div className={styles.ocrPanelEmpty}>未识别到可复制文字</div>
                  )}
                </div>
              </div>
            ) : null}
          </div>
        )}
      />

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
              这会把「{pendingDelete.title || "无标题笔记"}」移到废纸篓。
              30天后将自动永久删除。
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

      {pendingPermanentDelete && (
        <div className={styles.modalLayer} role="presentation">
          <div
            className={styles.modalBackdrop}
            onClick={() => setPendingPermanentDelete(null)}
          />
          <div className={styles.modal} role="dialog" aria-modal="true">
            <span className={styles.modalTag}>Danger Zone</span>
            <h3>永久删除这篇笔记？</h3>
            <p>
              「{pendingPermanentDelete.title || "无标题笔记"}」将被永久删除，无法恢复。
            </p>
            <div className={styles.modalActions}>
              <button
                className={styles.modalCancel}
                onClick={() => setPendingPermanentDelete(null)}
                type="button"
              >
                取消
              </button>
              <button
                className={styles.modalConfirm}
                onClick={() => permanentDeleteNote(pendingPermanentDelete.id)}
                type="button"
              >
                永久删除
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingEmptyTrash && (
        <div className={styles.modalLayer} role="presentation">
          <div
            className={styles.modalBackdrop}
            onClick={() => setPendingEmptyTrash(false)}
          />
          <div className={styles.modal} role="dialog" aria-modal="true">
            <span className={styles.modalTag}>Danger Zone</span>
            <h3>清空废纸篓？</h3>
            <p>
              废纸篓中的 {trashList.length} 篇笔记将被永久删除，无法恢复。
            </p>
            <div className={styles.modalActions}>
              <button
                className={styles.modalCancel}
                onClick={() => setPendingEmptyTrash(false)}
                type="button"
              >
                取消
              </button>
              <button
                className={styles.modalConfirm}
                onClick={emptyTrash}
                type="button"
              >
                全部永久删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
