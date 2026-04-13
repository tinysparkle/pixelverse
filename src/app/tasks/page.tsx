import TasksPage from "@/components/tasks/TasksPage";

export const metadata = {
  title: "任务队列 — Pixelverse",
  description: "管理你的待办事项和提醒",
};

export default function TasksRoute() {
  return <TasksPage />;
}
