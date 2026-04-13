import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getUpcomingTasksForUser } from "@/lib/db/queries";

// GET /api/tasks/upcoming?days=7 — 获取即将到期的任务
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const daysParam = req.nextUrl.searchParams.get("days");
  const days = daysParam ? Math.max(1, Math.min(90, Number(daysParam) || 7)) : 7;

  const tasks = await getUpcomingTasksForUser(session.user.id, days);

  return NextResponse.json(tasks);
}
