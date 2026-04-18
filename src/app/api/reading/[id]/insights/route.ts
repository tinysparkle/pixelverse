import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { generateTermInsight } from "@/lib/ai/reading";
import {
  getReadingItemByIdForUser,
  getReadingTermInsightByNormalizedTextForUser,
  upsertReadingTermInsightForUser,
} from "@/lib/db/queries";
import { normalizeSelectedText, normalizeVocabText, type VocabEntryKind } from "@/components/reading/readingUtils";

type Params = { params: Promise<{ id: string }> };

function detectKind(text: string): VocabEntryKind {
  return /\s/.test(text.trim()) ? "phrase" : "word";
}

function countTokens(text: string) {
  return text
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

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

export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const { id } = await params;
  const item = await getReadingItemByIdForUser(id, session.user.id);
  if (!item) return NextResponse.json({ error: "阅读文章不存在" }, { status: 404 });

  const body = await req.json();
  const selectedText = normalizeSelectedText(typeof body.selectedText === "string" ? body.selectedText : "");
  const anchorStart = typeof body.anchorStart === "number" ? body.anchorStart : null;
  const anchorEnd = typeof body.anchorEnd === "number" ? body.anchorEnd : null;

  if (!selectedText || anchorStart === null || anchorEnd === null || anchorStart < 0 || anchorEnd <= anchorStart) {
    return NextResponse.json({ error: "划词内容或位置无效" }, { status: 400 });
  }

  if (selectedText.length > 80 || countTokens(selectedText) > 6) {
    return NextResponse.json({ error: "仅支持单词或短语", code: "selection_too_long" }, { status: 400 });
  }

  const normalizedText = normalizeVocabText(selectedText);
  if (!normalizedText) {
    return NextResponse.json({ error: "划词内容无效" }, { status: 400 });
  }

  const cached = await getReadingTermInsightByNormalizedTextForUser(session.user.id, normalizedText);
  if (cached) {
    return NextResponse.json({ ...cached, fromCache: true });
  }

  const detectedKind = detectKind(selectedText);
  const sentenceBounds = findSentenceBounds(item.contentText, anchorStart, anchorEnd);
  const paragraphBounds = findParagraphBounds(item.contentText, anchorStart, anchorEnd);
  const sentence = item.contentText.slice(sentenceBounds.start, sentenceBounds.end).trim();
  const paragraph = item.contentText.slice(paragraphBounds.start, paragraphBounds.end).trim();

  const generated = await generateTermInsight({
    articleTitle: item.title,
    selectedText,
    detectedKind,
    sentence,
    paragraph: paragraph || sentence,
  });

  const stored = await upsertReadingTermInsightForUser(session.user.id, {
    text: selectedText,
    normalizedText,
    detectedKind: generated.detected_kind,
    glossCn: generated.gloss_cn,
    phonetic: generated.phonetic || null,
    partOfSpeech: generated.part_of_speech || null,
    grammarTags: generated.grammar_tags,
    definitionEn: generated.definition_en || null,
    exampleEn: generated.example_en || null,
    exampleCn: generated.example_cn || null,
    sourceSentence: sentence || null,
  });

  return NextResponse.json({
    ...stored,
    fromCache: false,
  });
}
