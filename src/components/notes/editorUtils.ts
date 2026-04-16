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
    const domain = parsed.hostname.replace(/^www\./i, "");

    const parts = domain.split(".");
    const secondLevel = parts.length > 1 ? parts[parts.length - 2] : parts[0];
    const normalized = secondLevel.toLowerCase();

    const siteNameMap: Record<string, string> = {
      github: "GitHub",
      gitlab: "GitLab",
      x: "X",
      twitter: "X",
      youtube: "YouTube",
      bilibili: "Bilibili",
      google: "Google",
      zhihu: "知乎",
      juejin: "稀土掘金",
      medium: "Medium",
      stackoverflow: "Stack Overflow",
      reddit: "Reddit",
      wikipedia: "Wikipedia",
    };

    const fallbackName = normalized
      ? normalized.charAt(0).toUpperCase() + normalized.slice(1)
      : "";
    const siteName = siteNameMap[normalized] ?? fallbackName;

    const display = siteName ? `${siteName} · ${domain}` : domain;
    if (display.length <= maxLength) return display;
    return `${display.slice(0, maxLength - 1)}…`;
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
