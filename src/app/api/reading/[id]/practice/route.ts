import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { generateReadingPractice } from "@/lib/ai/reading";
import { createReadingPracticeForUser, getReadingItemByIdForUser, listReadingAnnotationsForItem } from "@/lib/db/queries";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const { id } = await params;
  const item = await getReadingItemByIdForUser(id, session.user.id);
  if (!item) return NextResponse.json({ error: "阅读文章不存在" }, { status: 404 });

  await req.json().catch(() => null);

  const annotations = await listReadingAnnotationsForItem(id, session.user.id);
  const vocabList = Array.from(
    new Map(
      annotations
        .filter((annotation) => annotation.vocabEntryId && annotation.vocabKind)
        .map((annotation) => [
          annotation.vocabEntryId,
          {
            id: annotation.vocabEntryId,
            kind: annotation.vocabKind!,
            text: annotation.vocabText ?? annotation.selectedText,
            note: annotation.vocabNoteText,
          },
        ])
    ).values()
  );

  if (vocabList.length === 0) {
    return NextResponse.json({ error: "请先标注生词或短语后再生成练习" }, { status: 400 });
  }

  try {
    const practice = await generateReadingPractice({
      articleTitle: item.title,
      vocabList,
    });

    const record = await createReadingPracticeForUser(session.user.id, {
      readingItemId: id,
      practiceType: practice.practice_type,
      questionJson: JSON.stringify(practice),
    });

    return NextResponse.json({ record, practice }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "生成练习失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
