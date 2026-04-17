import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getReadingItemByIdForUser, softDeleteReadingItemForUser, updateReadingItemForUser } from "@/lib/db/queries";
import { countWords, normalizeTitle, normalizeTopic, type ReadingLengthBucket, type ReadingLevel, type ReadingStatus } from "@/components/reading/readingUtils";

type Params = { params: Promise<{ id: string }> };

const VALID_LEVELS = new Set<ReadingLevel>(["cet4", "b1", "b2"]);
const VALID_LENGTHS = new Set<ReadingLengthBucket>(["short", "medium", "long"]);
const VALID_STATUSES = new Set<ReadingStatus>(["new", "reading", "reviewed", "trained"]);

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const { id } = await params;
  const item = await getReadingItemByIdForUser(id, session.user.id);

  if (!item) {
    return NextResponse.json({ error: "阅读文章不存在" }, { status: 404 });
  }

  return NextResponse.json(item);
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json();

  const updates: {
    title?: string;
    topic?: string;
    level?: ReadingLevel;
    lengthBucket?: ReadingLengthBucket;
    status?: ReadingStatus;
    generationPromptJson?: string | null;
    contentText?: string;
    contentJson?: string | null;
    wordCount?: number;
  } = {};

  if (body.title !== undefined && typeof body.title === "string") updates.title = normalizeTitle(body.title);
  if (body.topic !== undefined && typeof body.topic === "string") updates.topic = normalizeTopic(body.topic);
  if (body.level !== undefined && VALID_LEVELS.has(body.level)) updates.level = body.level;
  if (body.lengthBucket !== undefined && VALID_LENGTHS.has(body.lengthBucket)) updates.lengthBucket = body.lengthBucket;
  if (body.status !== undefined && VALID_STATUSES.has(body.status)) updates.status = body.status;
  if (body.generationPromptJson !== undefined) updates.generationPromptJson = body.generationPromptJson ? JSON.stringify(body.generationPromptJson) : null;
  if (body.contentText !== undefined && typeof body.contentText === "string") {
    updates.contentText = body.contentText.trim();
    updates.wordCount = countWords(body.contentText);
  }
  if (body.contentJson !== undefined) updates.contentJson = body.contentJson ? JSON.stringify(body.contentJson) : null;

  const updated = await updateReadingItemForUser(id, session.user.id, updates);
  if (!updated) {
    return NextResponse.json({ error: "阅读文章不存在" }, { status: 404 });
  }

  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const { id } = await params;
  const deleted = await softDeleteReadingItemForUser(id, session.user.id);

  if (!deleted) {
    return NextResponse.json({ error: "阅读文章不存在" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
