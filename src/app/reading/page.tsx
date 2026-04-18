import { Suspense } from "react";
import ReadingPage from "@/components/reading/ReadingPage";

export const metadata = {
  title: "英语阅读训练 - Pixelverse",
  description: "AI 生成英语阅读文章，并联动阅读训练与单词卡片复习。",
};

export default function ReadingRoute() {
  return (
    <Suspense fallback={null}>
      <ReadingPage />
    </Suspense>
  );
}
