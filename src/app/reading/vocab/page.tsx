import { redirect } from "next/navigation";

export const metadata = {
  title: "单词卡片 - Pixelverse",
  description: "词库与复习卡片已合并到统一页面。",
};

export default function ReadingVocabRoute() {
  redirect("/reading/review");
}
