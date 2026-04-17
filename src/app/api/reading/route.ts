import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createReadingItemForUser, listReadingItemsForUser } from "@/lib/db/queries";
import { countWords, normalizeTitle, normalizeTopic, type ReadingLengthBucket, type ReadingLevel, type ReadingStatus } from "@/components/reading/readingUtils";

const VALID_LEVELS = new Set<ReadingLevel>(["cet4", "b1", "b2"]);
const VALID_LENGTHS = new Set<ReadingLengthBucket>(["short", "medium", "long"]);
const VALID_STATUSES = new Set<ReadingStatus>(["new", "reading", "reviewed", "trained"]);

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const sp = req.nextUrl.searchParams;
  const level = sp.get("level")?.trim() as ReadingLevel | null;
  const status = sp.get("status")?.trim() as ReadingStatus | null;
  const topic = sp.get("topic")?.trim() || undefined;

  const list = await listReadingItemsForUser(session.user.id, {
    level: level && VALID_LEVELS.has(level) ? level : undefined,
    status: status && VALID_STATUSES.has(status) ? status : undefined,
    topic,
  });

  return NextResponse.json(list);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const body = await req.json();

  if (!body.title || typeof body.title !== "string") {
    return NextResponse.json({ error: "标题不能为空" }, { status: 400 });
  }
  if (!body.topic || typeof body.topic !== "string") {
    return NextResponse.json({ error: "主题不能为空" }, { status: 400 });
  }
  if (!body.contentText || typeof body.contentText !== "string") {
    return NextResponse.json({ error: "文章内容不能为空" }, { status: 400 });
  }

  const level = typeof body.level === "string" && VALID_LEVELS.has(body.level as ReadingLevel)
    ? body.level as ReadingLevel
    : "cet4";
  const lengthBucket = typeof body.lengthBucket === "string" && VALID_LENGTHS.has(body.lengthBucket as ReadingLengthBucket)
    ? body.lengthBucket as ReadingLengthBucket
    : "medium";

  const item = await createReadingItemForUser(session.user.id, {
    title: normalizeTitle(body.title),
    topic: normalizeTopic(body.topic),
    level,
    lengthBucket,
    status: "new",
    generationPromptJson: body.generationPromptJson ? JSON.stringify(body.generationPromptJson) : null,
    contentText: body.contentText.trim(),
    contentJson: body.contentJson ? JSON.stringify(body.contentJson) : null,
    wordCount: countWords(body.contentText),
  });

  if (!item) {
    return NextResponse.json({ error: "创建阅读文章失败" }, { status: 500 });
  }

  return NextResponse.json(item, { status: 201 });
}
