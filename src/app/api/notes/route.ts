import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createNoteForUser, listNotesForUser } from "@/lib/db/queries";

// GET /api/notes — 获取笔记列表（支持 ?query= 搜索）
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const query = req.nextUrl.searchParams.get("query")?.trim() || undefined;
  const list = await listNotesForUser(session.user.id, query);

  return NextResponse.json(list);
}

// POST /api/notes — 新建笔记
export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const note = await createNoteForUser(session.user.id);

  if (!note) {
    return NextResponse.json({ error: "创建笔记失败" }, { status: 500 });
  }

  return NextResponse.json(note, { status: 201 });
}
