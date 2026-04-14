import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getNewsItemByIdForUser, markNewsAsRead, toggleNewsBookmark } from "@/lib/db/queries";

// GET /api/news/[id] — 获取单条资讯详情
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const { id } = await params;
  const item = await getNewsItemByIdForUser(id, session.user.id);

  if (!item) {
    return NextResponse.json({ error: "资讯不存在" }, { status: 404 });
  }

  return NextResponse.json(item);
}

// PATCH /api/news/[id] — 标记已读 / 切换收藏
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json();

  if (body.action === "read") {
    await markNewsAsRead(id, session.user.id);
    return NextResponse.json({ ok: true });
  }

  if (body.action === "bookmark") {
    const bookmarked = await toggleNewsBookmark(id, session.user.id);
    return NextResponse.json({ bookmarked });
  }

  return NextResponse.json({ error: "无效操作" }, { status: 400 });
}
