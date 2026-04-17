import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  getVocabEntryWithContextsForUser,
  softDeleteVocabEntryForUser,
  updateVocabEntryForUser,
} from "@/lib/db/queries";
import type { VocabMasteryState } from "@/lib/db/types";

type Params = { params: Promise<{ id: string }> };
const VALID_MASTERY = new Set<VocabMasteryState>(["new", "learning", "known"]);

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const { id } = await params;
  const detail = await getVocabEntryWithContextsForUser(id, session.user.id);
  if (!detail) return NextResponse.json({ error: "词条不存在" }, { status: 404 });

  return NextResponse.json(detail);
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const updated = await updateVocabEntryForUser(id, session.user.id, {
    noteText: body.noteText !== undefined && typeof body.noteText === "string" ? body.noteText.trim() || null : undefined,
    masteryState: body.masteryState && VALID_MASTERY.has(body.masteryState as VocabMasteryState)
      ? body.masteryState as VocabMasteryState
      : undefined,
  });

  if (!updated) return NextResponse.json({ error: "词条不存在" }, { status: 404 });
  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const { id } = await params;
  const deleted = await softDeleteVocabEntryForUser(id, session.user.id);
  if (!deleted) return NextResponse.json({ error: "词条不存在" }, { status: 404 });

  return NextResponse.json({ ok: true });
}
