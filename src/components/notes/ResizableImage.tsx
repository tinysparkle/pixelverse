import Image from "@tiptap/extension-image";
import { Maximize2 } from "lucide-react";
import {
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type NodeViewProps,
} from "@tiptap/react";
import { useCallback } from "react";
import { clampImageWidth } from "./editorUtils";

function ResizableImageView({ node, selected, updateAttributes }: NodeViewProps) {
  const width = clampImageWidth(Number(node.attrs.width ?? 560));

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLSpanElement>) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.pointerType === "mouse" && event.button !== 0) return;

      const el = event.currentTarget;
      el.setPointerCapture(event.pointerId);

      const startX = event.clientX;
      const startWidth = clampImageWidth(Number(node.attrs.width ?? 560));

      const onMove = (moveEvent: PointerEvent) => {
        const delta = moveEvent.clientX - startX;
        updateAttributes({ width: clampImageWidth(startWidth + delta) });
      };

      const onUp = (upEvent: PointerEvent) => {
        try {
          el.releasePointerCapture(upEvent.pointerId);
        } catch {
          /* ignore */
        }
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
        document.body.style.userSelect = "";
      };

      document.body.style.userSelect = "none";
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    },
    [node.attrs.width, updateAttributes]
  );

  return (
    <NodeViewWrapper
      as="figure"
      className={`resizable-image ${selected ? "is-selected" : ""}`}
      data-drag-handle={false}
      style={{ width: `${width}px` }}
    >
      <img
        src={String(node.attrs.src ?? "")}
        alt={String(node.attrs.alt ?? "")}
        title={String(node.attrs.title ?? "")}
        data-width={String(width)}
        style={{ width: "100%", maxWidth: "100%", height: "auto" }}
      />
      <span
        className="resize-handle"
        onPointerDown={handlePointerDown}
        aria-label="拖拽调整图片宽度"
      >
        <Maximize2 className="resize-handle-icon" size={14} strokeWidth={2.2} />
      </span>
    </NodeViewWrapper>
  );
}

export const ResizableImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: 560,
        parseHTML: (element) => element.getAttribute("data-width") || element.getAttribute("width") || "560",
        renderHTML: (attributes) => {
          const width = clampImageWidth(Number(attributes.width ?? 560));
          return {
            width: String(width),
            "data-width": String(width),
            style: `width:${width}px;max-width:100%;height:auto;`,
          };
        },
      },
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(ResizableImageView);
  },
});
