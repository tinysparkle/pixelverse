import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getReadingItemByIdForUser, softDeleteReadingAnnotationForUser } from "@/lib/db/queries";

type Params = { params: Promise<{ id: string; annotationId: string }> };

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const { id: readingItemId, annotationId } = await params;
  const item = await getReadingItemByIdForUser(readingItemId, session.user.id);
  if (!item) {
    return NextResponse.json({ error: "阅读文章不存在" }, { status: 404 });
  }

  const ok = await softDeleteReadingAnnotationForUser(annotationId, readingItemId, session.user.id);
  if (!ok) {
    return NextResponse.json({ error: "标注不存在或已删除" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
