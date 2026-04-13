import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { listTasksForUser, createTaskForUser } from "@/lib/db/queries";
import type { TaskPriority } from "@/lib/db/types";

const VALID_PRIORITIES = new Set<string>(["high", "medium", "low"]);

// GET /api/tasks — 获取任务列表（支持筛选）
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const sp = req.nextUrl.searchParams;
  const tag = sp.get("tag")?.trim() || undefined;
  const priority = sp.get("priority")?.trim() || undefined;
  const status = sp.get("status")?.trim() || undefined;

  const filters: { tag?: string; priority?: TaskPriority; status?: "pending" | "completed" } = {};
  if (tag) filters.tag = tag;
  if (priority && VALID_PRIORITIES.has(priority)) filters.priority = priority as TaskPriority;
  if (status === "pending" || status === "completed") filters.status = status;

  const list = await listTasksForUser(session.user.id, filters);

  return NextResponse.json(list);
}

// POST /api/tasks — 创建任务
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const body = await req.json();

  if (!body.title || typeof body.title !== "string" || !body.title.trim()) {
    return NextResponse.json({ error: "标题不能为空" }, { status: 400 });
  }

  const data: {
    title: string;
    description?: string | null;
    dueDate?: string | null;
    priority?: TaskPriority;
    tags?: string[];
  } = { title: body.title.trim() };

  if (body.description !== undefined) data.description = body.description;
  if (body.dueDate !== undefined) data.dueDate = body.dueDate;
  if (body.priority && VALID_PRIORITIES.has(body.priority)) data.priority = body.priority;
  if (Array.isArray(body.tags)) data.tags = body.tags.filter((t: unknown) => typeof t === "string" && t.trim()).map((t: string) => t.trim());

  const task = await createTaskForUser(session.user.id, data);

  if (!task) {
    return NextResponse.json({ error: "创建任务失败" }, { status: 500 });
  }

  return NextResponse.json(task, { status: 201 });
}
