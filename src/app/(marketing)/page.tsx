import { auth } from "@/lib/auth";
import HomePage from "./HomePage";

export const metadata = {
  title: "Pixelverse",
  description: "一个会继续长大的个人站",
};

export default async function MarketingPage() {
  const session = await auth();

  return <HomePage isAuthenticated={Boolean(session?.user?.id)} />;
}
