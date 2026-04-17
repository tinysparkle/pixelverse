import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createReadingItemForUser, listReadingItemsForUser, listVocabEntriesForUser } from "@/lib/db/queries";
import { generateReadingArticle } from "@/lib/ai/reading";
import { countWords, normalizeTopic, type ReadingLengthBucket, type ReadingLevel } from "@/components/reading/readingUtils";

const VALID_LEVELS = new Set<ReadingLevel>(["cet4", "b1", "b2"]);
const VALID_LENGTHS = new Set<ReadingLengthBucket>(["short", "medium", "long"]);
const VALID_PRESETS = new Set(["news", "science", "story", "exam"]);

const TOPIC_PRESET_CONFIG = {
  news: {
    label: "新闻时事",
    angles: [
      "城市公共交通升级与通勤变化",
      "校园心理健康支持的新举措",
      "社区垃圾分类与环保行动",
      "人工智能进入课堂后的讨论",
      "极端天气对城市生活的影响",
    ],
  },
  science: {
    label: "科普阅读",
    angles: [
      "深海探索如何帮助人类理解地球",
      "可再生能源如何改变城市供电",
      "记忆形成背后的脑科学机制",
      "植物如何通过信号交流应对环境变化",
      "微塑料为何会进入食物链",
    ],
  },
  story: {
    label: "短篇故事",
    angles: [
      "一次火车旅行中的意外相遇",
      "校园志愿活动带来的小变化",
      "旧书店里发现的一封信",
      "暴雨天帮助陌生人的一天",
      "一次误会如何变成友谊",
    ],
  },
  exam: {
    label: "考试风格",
    angles: [
      "大学生如何平衡学习与运动",
      "线上学习对阅读习惯的影响",
      "团队合作为何在校园项目中重要",
      "图书馆是否仍然是大学生活的中心",
      "培养长期习惯比短期努力更重要吗",
    ],
  },
} as const;

function shuffleInPlace<T>(items: T[]) {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

/** 从生词本随机取 3～5 个词条的原文（不足 3 条则全取）。 */
function pickWordbookReuseTexts(entries: { text: string }[]): string[] {
  if (entries.length === 0) return [];
  const capped = entries.slice(0, 200);
  shuffleInPlace(capped);
  if (entries.length < 3) {
    return capped.map((e) => e.text);
  }
  const count = Math.min(capped.length, Math.floor(Math.random() * 3) + 3);
  return capped.slice(0, count).map((e) => e.text);
}

function pickRandom<T>(items: readonly T[]) {
  return items[Math.floor(Math.random() * items.length)];
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const body = await req.json();
  const topicPreset = typeof body.topicPreset === "string" && VALID_PRESETS.has(body.topicPreset)
    ? body.topicPreset as keyof typeof TOPIC_PRESET_CONFIG
    : null;
  const topicConfig = topicPreset ? TOPIC_PRESET_CONFIG[topicPreset] : null;
  const topic = topicConfig
    ? topicConfig.label
    : typeof body.topic === "string"
      ? normalizeTopic(body.topic)
      : "日常生活";
  const angle = topicConfig ? pickRandom(topicConfig.angles) : null;
  const level = typeof body.level === "string" && VALID_LEVELS.has(body.level as ReadingLevel)
    ? body.level as ReadingLevel
    : "cet4";
  const length = typeof body.lengthBucket === "string" && VALID_LENGTHS.has(body.lengthBucket as ReadingLengthBucket)
    ? body.lengthBucket as ReadingLengthBucket
    : "medium";

  try {
    const [vocabList, recentItems] = await Promise.all([
      listVocabEntriesForUser(session.user.id),
      listReadingItemsForUser(session.user.id),
    ]);
    const wordbookReuse = pickWordbookReuseTexts(vocabList);
    const avoidTitles = recentItems.slice(0, 6).map((item) => item.title);
    const avoidTopics = recentItems.slice(0, 6).map((item) => item.topic);

    const generated = await generateReadingArticle({
      topic,
      level,
      length,
      angle: angle ?? undefined,
      avoidTitles,
      avoidTopics,
      wordbookReuse: wordbookReuse.length ? wordbookReuse : undefined,
    });
    const item = await createReadingItemForUser(session.user.id, {
      title: generated.title,
      topic: generated.topic,
      level: generated.level,
      lengthBucket: length,
      status: "new",
      generationPromptJson: JSON.stringify({ topicPreset, topic, angle, level, length, wordbookReuse }),
      contentText: generated.content,
      contentJson: JSON.stringify({
        summaryCn: generated.summary_cn,
        grammarFocus: generated.grammar_focus,
        keyVocabulary: generated.key_vocabulary,
      }),
      wordCount: countWords(generated.content),
    });

    return NextResponse.json({
      item,
      generated,
    }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "生成文章失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
