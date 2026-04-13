import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { toggleTaskComplete } from "@/lib/db/queries";

type Params = { params: Promise<{ id: string }> };

// POST /api/tasks/:id/toggle — 切换完成状态
export async function POST(_req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const { id } = await params;
  const task = await toggleTaskComplete(id, session.user.id);

  if (!task) {
    return NextResponse.json({ error: "任务不存在" }, { status: 404 });
  }

  return NextResponse.json(task);
}
