import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { insertNewsItems } from "@/lib/db/queries";
import { fetchWithOptionalProxy } from "@/lib/net/fetch";

// POST /api/news/sync — 从 Cloudflare Worker 拉取最新新闻并存入 MySQL
export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const workerUrl = process.env.CF_WORKER_URL;
  const workerSecret = process.env.CF_WORKER_SECRET;

  if (!workerUrl || !workerSecret) {
    return NextResponse.json(
      { error: "新闻服务未配置" },
      { status: 503 }
    );
  }

  try {
    const url = new URL("/api/news", workerUrl);
    url.searchParams.set("limit", "100");

    const res = await fetchWithOptionalProxy(url.toString(), {
      headers: { Authorization: `Bearer ${workerSecret}` },
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `Worker 返回 ${res.status}` },
        { status: 502 }
      );
    }

    const items = await res.json();

    if (!Array.isArray(items)) {
      return NextResponse.json(
        { error: "Worker 返回格式异常" },
        { status: 502 }
      );
    }

    const inserted = await insertNewsItems(items);

    return NextResponse.json({ synced: inserted, total: items.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : "未知错误";
    return NextResponse.json({ error: `同步失败: ${message}` }, { status: 500 });
  }
}
