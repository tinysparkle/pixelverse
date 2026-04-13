import { auth } from "@/lib/auth";
import { getUpcomingTasksForUser } from "@/lib/db/queries";
import HomePage from "./HomePage";

export const metadata = {
  title: "Pixelverse",
  description: "像素宇宙，探索从这里开始",
};

export default async function MarketingPage() {
  const session = await auth();
  const userId = session?.user?.id;

  const upcomingTasks = userId ? await getUpcomingTasksForUser(userId, 7) : [];

  return (
    <HomePage
      isAuthenticated={Boolean(userId)}
      upcomingTasks={upcomingTasks}
    />
  );
}
