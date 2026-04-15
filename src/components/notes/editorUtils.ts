export const IMAGE_MIN_WIDTH = 120;
export const IMAGE_MAX_WIDTH = 1200;

export interface ImageViewerItem {
  key: string;
  src: string;
}

interface TiptapLikeNode {
  type?: string;
  attrs?: {
    src?: unknown;
  };
  content?: TiptapLikeNode[];
}

export function isPureUrlText(text: string): boolean {
  const value = text.trim();
  if (!/^https?:\/\/\S+$/i.test(value)) return false;

  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function formatUrlDisplayText(url: string, maxLength = 36): string {
  try {
    const parsed = new URL(url);
    const raw = `${parsed.host}${parsed.pathname}${parsed.search}`;
    if (raw.length <= maxLength) return raw;
    return `${raw.slice(0, maxLength - 1)}…`;
  } catch {
    const fallback = url.trim();
    if (fallback.length <= maxLength) return fallback;
    return `${fallback.slice(0, maxLength - 1)}…`;
  }
}

export function clampImageWidth(width: number): number {
  return Math.min(IMAGE_MAX_WIDTH, Math.max(IMAGE_MIN_WIDTH, Math.round(width)));
}

export function resolveInitialImageWidth(containerWidth?: number): number {
  if (!containerWidth || Number.isNaN(containerWidth)) {
    return 560;
  }

  return clampImageWidth(containerWidth * 0.8);
}

export function getContainerClassName(sidebarCollapsed: boolean): string {
  return sidebarCollapsed ? "container containerCollapsed" : "container";
}

export function extractImageViewerItems(doc: TiptapLikeNode | null | undefined): ImageViewerItem[] {
  const items: ImageViewerItem[] = [];

  const walk = (node: TiptapLikeNode | null | undefined) => {
    if (!node) return;

    if (node.type === "image" && typeof node.attrs?.src === "string" && node.attrs.src) {
      items.push({
        key: `${node.attrs.src}::${items.length}`,
        src: node.attrs.src,
      });
    }

    node.content?.forEach(walk);
  };

  walk(doc);
  return items;
}

export function findImageViewerIndex(images: ImageViewerItem[], currentSrc: string): number {
  const index = images.findIndex((image) => image.src === currentSrc);
  return index >= 0 ? index : 0;
}
