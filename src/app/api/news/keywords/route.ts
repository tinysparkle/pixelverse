import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getUserNewsKeywords, upsertNewsKeyword } from "@/lib/db/queries";

// GET /api/news/keywords — 获取用户关键词列表
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const keywords = await getUserNewsKeywords(session.user.id);
  return NextResponse.json(keywords);
}

// POST /api/news/keywords — 添加关键词
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const body = await req.json();
  const keyword = typeof body.keyword === "string" ? body.keyword.trim() : "";

  if (!keyword || keyword.length > 100) {
    return NextResponse.json({ error: "关键词无效" }, { status: 400 });
  }

	const keywords = await upsertNewsKeyword(session.user.id, keyword);
  return NextResponse.json(keywords, { status: 201 });
}
