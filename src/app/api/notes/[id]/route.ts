import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  getNoteByIdForUser,
  softDeleteNoteForUser,
  updateNoteForUser,
} from "@/lib/db/queries";

type Params = { params: Promise<{ id: string }> };

// GET /api/notes/:id — 获取单篇笔记
export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const { id } = await params;

  const note = await getNoteByIdForUser(id, session.user.id);

  if (!note) {
    return NextResponse.json({ error: "笔记不存在" }, { status: 404 });
  }

  return NextResponse.json(note);
}

// PATCH /api/notes/:id — 更新笔记
export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json();

  // 防止空内容误覆盖
  const updateData: Record<string, string | null> = {};
  if (body.title !== undefined && body.title !== null) {
    updateData.title = body.title;
  }
  if (body.contentJson !== undefined && body.contentJson !== null) {
    updateData.contentJson = body.contentJson;
  }
  if (body.contentText !== undefined && body.contentText !== null) {
    updateData.contentText = body.contentText;
  }

  const updated = await updateNoteForUser(id, session.user.id, updateData);

  if (!updated) {
    return NextResponse.json({ error: "笔记不存在" }, { status: 404 });
  }

  return NextResponse.json(updated);
}

// DELETE /api/notes/:id — 软删除笔记
export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const { id } = await params;

  const deleted = await softDeleteNoteForUser(id, session.user.id);

  if (!deleted) {
    return NextResponse.json({ error: "笔记不存在" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
