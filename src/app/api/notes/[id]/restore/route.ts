import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { restoreNoteForUser } from "@/lib/db/queries";

type Params = { params: Promise<{ id: string }> };

// POST /api/notes/:id/restore — 从废纸篓恢复笔记
export async function POST(_req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const { id } = await params;
  const restored = await restoreNoteForUser(id, session.user.id);

  if (!restored) {
    return NextResponse.json({ error: "笔记不存在或未被删除" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
