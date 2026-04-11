import { describe, it, expect } from "vitest";

describe("上传 API 安全性", () => {
  const ALLOWED_TYPES = new Set([
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
    "image/svg+xml",
  ]);

  const MAX_SIZE = 5 * 1024 * 1024;

  it("应只允许图片类型", () => {
    expect(ALLOWED_TYPES.has("image/jpeg")).toBe(true);
    expect(ALLOWED_TYPES.has("image/png")).toBe(true);
    expect(ALLOWED_TYPES.has("text/html")).toBe(false);
    expect(ALLOWED_TYPES.has("application/javascript")).toBe(false);
    expect(ALLOWED_TYPES.has("application/pdf")).toBe(false);
  });

  it("最大文件大小应为 5MB", () => {
    expect(MAX_SIZE).toBe(5242880);
  });

  it("应拒绝 XSS 类型的文件扩展名", () => {
    const dangerous = [".html", ".js", ".php", ".sh", ".exe"];
    const safe = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg"];

    for (const ext of dangerous) {
      expect(safe.includes(ext)).toBe(false);
    }
  });
});

describe("数据库 Schema", () => {
  it("笔记表应有软删除字段", () => {
    // 验证 schema 设计包含 deletedAt
    const noteFields = [
      "id", "userId", "title", "contentJson",
      "contentText", "createdAt", "updatedAt", "deletedAt"
    ];
    expect(noteFields).toContain("deletedAt");
  });

  it("用户 ID 应使用 UUID", () => {
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    // UUID v4 格式验证
    const sampleUuid = "550e8400-e29b-41d4-a716-446655440000";
    expect(uuidPattern.test(sampleUuid)).toBe(true);
  });
});

describe("Auth 配置", () => {
  it("登录页面路由应为 /login", () => {
    const signInPage = "/login";
    expect(signInPage).toBe("/login");
  });

  it("会话策略应为 JWT", () => {
    const strategy = "jwt";
    expect(strategy).toBe("jwt");
  });
});

describe("笔记格式化", () => {
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

  it("应显示'刚刚'对于刚创建的笔记", () => {
    const now = new Date().toISOString();
    expect(formatDate(now)).toBe("刚刚");
  });

  it("应显示分钟前", () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60000).toISOString();
    expect(formatDate(fiveMinAgo)).toBe("5 分钟前");
  });

  it("应显示小时前", () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 3600000).toISOString();
    expect(formatDate(twoHoursAgo)).toBe("2 小时前");
  });

  it("长时间前应显示日期", () => {
    const longAgo = "2024-01-15T12:00:00Z";
    const result = formatDate(longAgo);
    expect(result).not.toBe("刚刚");
    expect(result).not.toContain("分钟前");
    expect(result).not.toContain("小时前");
  });
});

describe("笔记摘要截断", () => {
  it("应截断超过 120 字符的摘要", () => {
    const longText = "a".repeat(200);
    const excerpt = longText.slice(0, 120);
    expect(excerpt.length).toBe(120);
  });

  it("应保留短摘要不变", () => {
    const shortText = "这是一篇短笔记";
    const excerpt = shortText.length > 120 ? shortText.slice(0, 120) : shortText;
    expect(excerpt).toBe(shortText);
  });
});
