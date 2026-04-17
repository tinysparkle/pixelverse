import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createReadingItemForUser, listVocabEntriesForUser } from "@/lib/db/queries";
import { generateReadingArticle } from "@/lib/ai/reading";
import { countWords, normalizeTopic, type ReadingLengthBucket, type ReadingLevel } from "@/components/reading/readingUtils";

const VALID_LEVELS = new Set<ReadingLevel>(["cet4", "b1", "b2"]);
const VALID_LENGTHS = new Set<ReadingLengthBucket>(["short", "medium", "long"]);

function shuffleInPlace<T>(items: T[]) {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

/** 从生词本随机取 3～5 个词条的原文（不足 3 条则全取）。 */
function pickWordbookReuseTexts(entries: { text: string }[]): string[] {
  if (entries.length === 0) return [];
  const capped = entries.slice(0, 200);
  shuffleInPlace(capped);
  if (entries.length < 3) {
    return capped.map((e) => e.text);
  }
  const count = Math.min(capped.length, Math.floor(Math.random() * 3) + 3);
  return capped.slice(0, count).map((e) => e.text);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const body = await req.json();
  const topic = typeof body.topic === "string" ? normalizeTopic(body.topic) : "日常生活";
  const level = typeof body.level === "string" && VALID_LEVELS.has(body.level as ReadingLevel)
    ? body.level as ReadingLevel
    : "cet4";
  const length = typeof body.lengthBucket === "string" && VALID_LENGTHS.has(body.lengthBucket as ReadingLengthBucket)
    ? body.lengthBucket as ReadingLengthBucket
    : "medium";

  try {
    const vocabList = await listVocabEntriesForUser(session.user.id);
    const wordbookReuse = pickWordbookReuseTexts(vocabList);

    const generated = await generateReadingArticle({
      topic,
      level,
      length,
      wordbookReuse: wordbookReuse.length ? wordbookReuse : undefined,
    });
    const item = await createReadingItemForUser(session.user.id, {
      title: generated.title,
      topic: generated.topic,
      level: generated.level,
      lengthBucket: length,
      status: "new",
      generationPromptJson: JSON.stringify({ topic, level, length, wordbookReuse }),
      contentText: generated.content,
      contentJson: JSON.stringify({
        summaryCn: generated.summary_cn,
        grammarFocus: generated.grammar_focus,
        keyVocabulary: generated.key_vocabulary,
      }),
      wordCount: countWords(generated.content),
    });

    return NextResponse.json({
      item,
      generated,
    }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "生成文章失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
