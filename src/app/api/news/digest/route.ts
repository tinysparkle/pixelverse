import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getNewsItems } from "@/lib/db/queries";
import { generateDigest } from "@/lib/ai/zhipu";

// POST /api/news/digest — 使用智谱 AI 生成每日摘要
export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  // 获取今天的新闻
  const items = await getNewsItems(session.user.id, { limit: 30 });

  if (items.length === 0) {
    return NextResponse.json({ digest: "暂无新闻数据，请先同步。" });
  }

  try {
    const digest = await generateDigest(items);
    return NextResponse.json({ digest });
  } catch (err) {
    const message = err instanceof Error ? err.message : "未知错误";
    return NextResponse.json({ error: `摘要生成失败: ${message}` }, { status: 500 });
  }
}
