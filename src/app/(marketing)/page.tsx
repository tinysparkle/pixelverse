import { auth } from "@/lib/auth";
import HomePage from "./HomePage";

export const metadata = {
  title: "Pixelverse",
  description: "像素宇宙，探索从这里开始",
};

export default async function MarketingPage() {
  const session = await auth();

  return <HomePage isAuthenticated={Boolean(session?.user?.id)} />;
}
