import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getReviewForecastForUser } from "@/lib/db/queries";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const forecast = await getReviewForecastForUser(session.user.id);
  return NextResponse.json(forecast);
}
