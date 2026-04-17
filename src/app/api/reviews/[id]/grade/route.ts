import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { gradeReviewCardForUser } from "@/lib/db/queries";
import type { ReviewGrade } from "@/lib/db/types";

type Params = { params: Promise<{ id: string }> };
const VALID_GRADES = new Set<ReviewGrade>(["again", "hard", "good", "easy"]);

export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const body = await req.json();
  const grade = body.grade as ReviewGrade;
  if (!VALID_GRADES.has(grade)) {
    return NextResponse.json({ error: "复习评分无效" }, { status: 400 });
  }

  const { id } = await params;
  const updated = await gradeReviewCardForUser(id, session.user.id, grade);
  if (!updated) {
    return NextResponse.json({ error: "复习卡片不存在" }, { status: 404 });
  }

  return NextResponse.json(updated);
}
