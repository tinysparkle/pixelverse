import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { listVocabEntriesForUser } from "@/lib/db/queries";
import type { VocabEntryKind, VocabMasteryState } from "@/lib/db/types";

const VALID_KINDS = new Set<VocabEntryKind>(["word", "phrase"]);
const VALID_MASTERY = new Set<VocabMasteryState>(["new", "learning", "known"]);

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const searchParams = req.nextUrl.searchParams;
  const kind = searchParams.get("kind");
  const mastery = searchParams.get("mastery");
  const query = searchParams.get("q")?.trim() || undefined;

  const list = await listVocabEntriesForUser(session.user.id, {
    kind: kind && VALID_KINDS.has(kind as VocabEntryKind) ? kind as VocabEntryKind : undefined,
    masteryState: mastery && VALID_MASTERY.has(mastery as VocabMasteryState) ? mastery as VocabMasteryState : undefined,
    query,
  });

  return NextResponse.json(list);
}
