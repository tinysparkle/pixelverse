import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { permanentlyDeleteNoteForUser } from "@/lib/db/queries";

type Params = { params: Promise<{ id: string }> };

// DELETE /api/notes/:id/permanent — 永久删除笔记
export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const { id } = await params;
  const deleted = await permanentlyDeleteNoteForUser(id, session.user.id);

  if (!deleted) {
    return NextResponse.json({ error: "笔记不存在或未被删除" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
