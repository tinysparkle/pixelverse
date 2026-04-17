import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { listDueReviewCardsForUser } from "@/lib/db/queries";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const cards = await listDueReviewCardsForUser(session.user.id);
  return NextResponse.json(cards);
}
