import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  getTaskByIdForUser,
  updateTaskForUser,
  softDeleteTaskForUser,
} from "@/lib/db/queries";
import type { TaskPriority } from "@/lib/db/types";

type Params = { params: Promise<{ id: string }> };

const VALID_PRIORITIES = new Set<string>(["high", "medium", "low"]);

// GET /api/tasks/:id — 获取单个任务
export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const { id } = await params;
  const task = await getTaskByIdForUser(id, session.user.id);

  if (!task) {
    return NextResponse.json({ error: "任务不存在" }, { status: 404 });
  }

  return NextResponse.json(task);
}

// PATCH /api/tasks/:id — 更新任务
export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json();

  const updates: {
    title?: string;
    description?: string | null;
    dueDate?: string | null;
    priority?: TaskPriority;
    tags?: string[];
  } = {};

  if (body.title !== undefined) updates.title = body.title;
  if (body.description !== undefined) updates.description = body.description;
  if (body.dueDate !== undefined) updates.dueDate = body.dueDate;
  if (body.priority !== undefined && VALID_PRIORITIES.has(body.priority)) {
    updates.priority = body.priority;
  }
  if (body.tags !== undefined) {
    updates.tags = Array.isArray(body.tags)
      ? body.tags.filter((t: unknown) => typeof t === "string" && t.trim()).map((t: string) => t.trim())
      : [];
  }

  const updated = await updateTaskForUser(id, session.user.id, updates);

  if (!updated) {
    return NextResponse.json({ error: "任务不存在" }, { status: 404 });
  }

  return NextResponse.json(updated);
}

// DELETE /api/tasks/:id — 软删除任务
export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const { id } = await params;
  const deleted = await softDeleteTaskForUser(id, session.user.id);

  if (!deleted) {
    return NextResponse.json({ error: "任务不存在" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
