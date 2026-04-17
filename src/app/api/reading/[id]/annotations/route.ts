import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { auth } from "@/lib/auth";
import { generateContextualGloss, generateContextualGlossFast } from "@/lib/ai/reading";
import {
  createReadingAnnotationForUser,
  createReviewCardForVocabEntry,
  getReadingItemByIdForUser,
  listReadingAnnotationsForItem,
  updateVocabEntryForUser,
  upsertVocabEntryForUser,
} from "@/lib/db/queries";
import { normalizeSelectedText, type ReadingAnnotationKind } from "@/components/reading/readingUtils";

type Params = { params: Promise<{ id: string }> };
const VALID_KINDS = new Set<ReadingAnnotationKind>(["word", "phrase"]);

function findSentenceBounds(text: string, start: number, end: number) {
  const boundaryPattern = /[.!?。！？]\s|\n/g;
  let sentenceStart = 0;
  let sentenceEnd = text.length;

  for (const match of text.matchAll(boundaryPattern)) {
    const boundaryIndex = match.index ?? 0;
    if (boundaryIndex < start) {
      sentenceStart = boundaryIndex + match[0].length;
      continue;
    }

    if (boundaryIndex >= end) {
      sentenceEnd = boundaryIndex + 1;
      break;
    }
  }

  return {
    start: sentenceStart,
    end: sentenceEnd,
  };
}

function findParagraphBounds(text: string, start: number, end: number) {
  const before = text.lastIndexOf("\n\n", start);
  const after = text.indexOf("\n\n", end);

  return {
    start: before >= 0 ? before + 2 : 0,
    end: after >= 0 ? after : text.length,
  };
}

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const { id } = await params;
  const item = await getReadingItemByIdForUser(id, session.user.id);
  if (!item) return NextResponse.json({ error: "阅读文章不存在" }, { status: 404 });

  const annotations = await listReadingAnnotationsForItem(id, session.user.id);
  return NextResponse.json(annotations);
}

export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const { id } = await params;
  const item = await getReadingItemByIdForUser(id, session.user.id);
  if (!item) return NextResponse.json({ error: "阅读文章不存在" }, { status: 404 });

  const body = await req.json();
  const kind = body.kind as ReadingAnnotationKind;
  if (!VALID_KINDS.has(kind)) {
    return NextResponse.json({ error: "标注类型无效" }, { status: 400 });
  }

  const selectedText = normalizeSelectedText(typeof body.selectedText === "string" ? body.selectedText : "");
  if (!selectedText) {
    return NextResponse.json({ error: "标注内容不能为空" }, { status: 400 });
  }

  const anchorStart = typeof body.anchorStart === "number" ? body.anchorStart : null;
  const anchorEnd = typeof body.anchorEnd === "number" ? body.anchorEnd : null;
  if (anchorStart === null || anchorEnd === null || anchorStart < 0 || anchorEnd <= anchorStart) {
    return NextResponse.json({ error: "标注位置无效" }, { status: 400 });
  }

  const sentenceBounds = findSentenceBounds(item.contentText, anchorStart, anchorEnd);
  const sentence = item.contentText.slice(sentenceBounds.start, sentenceBounds.end).trim();
  const paragraphBounds = findParagraphBounds(item.contentText, anchorStart, anchorEnd);
  const paragraph = item.contentText.slice(paragraphBounds.start, paragraphBounds.end).trim();

  let vocabEntryId: string | null = null;

  if (kind === "word" || kind === "phrase") {
    const vocabResult = await upsertVocabEntryForUser(session.user.id, {
      kind,
      text: selectedText,
      noteText: null,
    });

    if (!vocabResult.entry) {
      return NextResponse.json({ error: "创建生词失败" }, { status: 500 });
    }

    vocabEntryId = vocabResult.entry.id;
    await createReviewCardForVocabEntry(session.user.id, vocabEntryId);

    if (!vocabResult.entry.glossCn && sentence && vocabEntryId) {
      const userId = session.user.id;
      const glossVocabId = vocabEntryId;
      after(async () => {
        try {
          let gloss = await generateContextualGlossFast({
            kind,
            selectedText,
            sentence,
          });
          if (!gloss) {
            const detailed = await generateContextualGloss({
              articleTitle: item.title,
              kind,
              selectedText,
              sentence,
              paragraph: paragraph || sentence,
            });
            gloss = detailed.gloss_cn;
          }
          if (gloss) {
            await updateVocabEntryForUser(glossVocabId, userId, {
              glossCn: gloss,
            });
          }
        } catch {
          // Ignore gloss generation failures; vocab creation already succeeded.
        }
      });
    }
  }

  const annotation = await createReadingAnnotationForUser(session.user.id, {
    readingItemId: id,
    kind,
    vocabEntryId,
    selectedText,
    anchorStart,
    anchorEnd,
  });

  if (!annotation) {
    return NextResponse.json({ error: "创建标注失败" }, { status: 500 });
  }

  return NextResponse.json(annotation, { status: 201 });
}
