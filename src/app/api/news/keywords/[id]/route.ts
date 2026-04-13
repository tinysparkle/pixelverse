import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { deleteNewsKeyword } from "@/lib/db/queries";

// DELETE /api/news/keywords/[id] — 删除关键词
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const { id } = await params;
  const deleted = await deleteNewsKeyword(id, session.user.id);

  if (!deleted) {
    return NextResponse.json({ error: "关键词不存在" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
