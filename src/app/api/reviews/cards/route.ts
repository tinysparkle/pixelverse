import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getReviewForecastForUser, listReadingStudyCardsForUser } from "@/lib/db/queries";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const [cards, forecast] = await Promise.all([
    listReadingStudyCardsForUser(session.user.id),
    getReviewForecastForUser(session.user.id),
  ]);

  return NextResponse.json({ cards, forecast });
}
