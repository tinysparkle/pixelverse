import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getNewsItems } from "@/lib/db/queries";

// GET /api/news — 获取新闻列表（支持筛选）
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const sp = req.nextUrl.searchParams;
  const keyword = sp.get("keyword")?.trim() || undefined;
  const source = sp.get("source")?.trim() || undefined;
  const unread = sp.get("unread") === "true" ? true : undefined;
  const limit = Math.min(Number(sp.get("limit")) || 50, 100);
  const offset = Math.max(Number(sp.get("offset")) || 0, 0);

  const list = await getNewsItems(session.user.id, {
    keyword,
    source,
    unread,
    limit,
    offset,
  });

  return NextResponse.json(list);
}
