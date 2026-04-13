import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getDeletedNotesForUser, purgeExpiredNotes } from "@/lib/db/queries";

// GET /api/notes/trash — 获取废纸篓列表
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  // 机会性清理超过 30 天的已删除笔记
  await purgeExpiredNotes();

  const list = await getDeletedNotesForUser(session.user.id);
  return NextResponse.json(list);
}
