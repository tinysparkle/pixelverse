import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createReadingItemForUser } from "@/lib/db/queries";
import { generateReadingArticle } from "@/lib/ai/reading";
import { countWords, normalizeTopic, type ReadingLengthBucket, type ReadingLevel } from "@/components/reading/readingUtils";

const VALID_LEVELS = new Set<ReadingLevel>(["cet4", "b1", "b2"]);
const VALID_LENGTHS = new Set<ReadingLengthBucket>(["short", "medium", "long"]);

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
    const generated = await generateReadingArticle({ topic, level, length });
    const item = await createReadingItemForUser(session.user.id, {
      title: generated.title,
      topic: generated.topic,
      level: generated.level,
      lengthBucket: length,
      status: "new",
      generationPromptJson: JSON.stringify({ topic, level, length }),
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
