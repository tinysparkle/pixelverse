import { z } from "zod";
import {
  type ReadingLengthBucket,
  type ReadingLevel,
  type VocabEntryKind,
  getReadingWordRange,
} from "@/components/reading/readingUtils";

const ARTICLE_SYSTEM_PROMPT = [
  "你是 Pixelverse 的英语阅读训练引擎。",
  "目标用户当前英语水平约为中国大学英语四级，整体接近 CEFR B1-B2 之间。",
  "请生成适合阅读训练的英文文章，而不是教学大纲。",
  "文章必须自然、可读、有明确主题，并保留适度挑战。",
  "避免过难专有名词堆砌，避免过于口语或网络俚语。",
  "输出必须严格遵守结构化格式。",
].join("\n");

const PRACTICE_SYSTEM_PROMPT = [
  "你是英语阅读训练出题助手。",
  "请只基于用户当前文章里的生词与短语生成词汇练习。",
  "题目必须适合四级水平，不要过难。",
  "每道题都必须有标准答案、简短解析，并能对应到一个具体词条。",
  "输出必须严格遵守结构化格式。",
].join("\n");

const GLOSS_SYSTEM_PROMPT = [
  "你是英语阅读词义标注助手。",
  "请根据用户划出的英文单词或短语，以及它所在句子和段落，给出最贴合当前语境的简短中文义项。",
  "输出要像学生写在课本上的上方批注，简洁、自然、不要书面腔。",
  "gloss_cn 只允许 2 到 12 个汉字，不能是整句翻译，不能带括号、编号或解释。",
  "如果是短语，优先给短语义；如果是单词，优先给句中义，不要机械词典硬译。",
  "输出必须严格遵守结构化格式。",
].join("\n");

const articleSchema = z.object({
  title: z.string(),
  topic: z.string(),
  level: z.enum(["cet4", "b1", "b2"]),
  content: z.string(),
  summary_cn: z.string(),
  grammar_focus: z.array(z.string()).max(6),
  key_vocabulary: z.array(z.string()).max(12),
});

const practiceQuestionSchema = z.object({
  id: z.string(),
  type: z.literal("vocab"),
  prompt: z.string(),
  choices: z.array(z.string()).min(2).max(4),
  answer: z.string(),
  explanation_cn: z.string(),
  related_vocab_entry_id: z.string().nullable(),
});

const practiceSchema = z.object({
  title: z.string(),
  practice_type: z.literal("vocab"),
  questions: z.array(practiceQuestionSchema).min(4).max(10),
});

const glossSchema = z.object({
  gloss_cn: z.string().min(2).max(12),
});

type ArticleOutput = z.infer<typeof articleSchema>;
type PracticeOutput = z.infer<typeof practiceSchema>;
type GlossOutput = z.infer<typeof glossSchema>;

type AiFormat = "openai" | "anthropic";

function truncateText(text: string, maxLength = 220) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1)}…`;
}

function extractTextFromUnknown(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object") {
          const record = item as Record<string, unknown>;
          if (typeof record.text === "string") return record.text;
          if (typeof record.content === "string") return record.content;
          if (record.type === "text" && typeof record.text === "string") return record.text;
        }
        return "";
      })
      .filter(Boolean)
      .join("\n")
      .trim();
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (typeof record.text === "string") return record.text;
    if (typeof record.content === "string") return record.content;
  }
  return "";
}

function extractTextFromResponse(payload: unknown, format: AiFormat) {
  if (!payload || typeof payload !== "object") return "";
  const data = payload as Record<string, unknown>;

  if (format === "openai") {
    const choice = Array.isArray(data.choices) ? data.choices[0] : null;
    if (choice && typeof choice === "object") {
      const choiceRecord = choice as Record<string, unknown>;
      const message = choiceRecord.message;
      if (message && typeof message === "object") {
        const messageRecord = message as Record<string, unknown>;
        const candidates = [
          messageRecord.content,
          messageRecord.reasoning_content,
          messageRecord.reasoning,
          messageRecord.output_text,
          messageRecord.text,
        ];

        for (const candidate of candidates) {
          const extracted = extractTextFromUnknown(candidate);
          if (extracted) return extracted;
        }
      }

      const fallbackCandidates = [
        choiceRecord.text,
        choiceRecord.message_content,
        choiceRecord.delta,
      ];

      for (const candidate of fallbackCandidates) {
        const extracted = extractTextFromUnknown(candidate);
        if (extracted) return extracted;
      }
    }
  }

  if (format === "anthropic") {
    const candidates = [data.content, data.output_text, data.text];
    for (const candidate of candidates) {
      const extracted = extractTextFromUnknown(candidate);
      if (extracted) return extracted;
    }
  }

  return typeof data.text === "string" ? data.text : "";
}

function parseJsonFromText(text: string) {
  const trimmed = text.trim();
  const fenceMatch = trimmed.match(/```json\s*([\s\S]*?)\s*```/i) ?? trimmed.match(/```\s*([\s\S]*?)\s*```/i);
  const candidate = fenceMatch?.[1]?.trim() ?? trimmed;

  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(candidate.slice(start, end + 1));
    }
    throw new Error(`AI 返回了非 JSON 文本，片段：${truncateText(candidate)}`);
  }
}

async function callAiText(input: {
  system: string;
  prompt: string;
  maxTokens?: number;
}) {
  const url = process.env.AI_API_URL;
  const apiKey = process.env.AI_API_KEY;
  const format = (process.env.AI_API_FORMAT || "openai") as AiFormat;

  if (!url) {
    throw new Error("AI_API_URL environment variable is not set");
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey ?? ""}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.AI_MODEL,
      messages: [
        { role: "system", content: input.system },
        { role: "user", content: input.prompt },
      ],
      max_tokens: input.maxTokens ?? 4000,
    }),
    cache: "no-store",
  });

  const rawText = await response.text();

  if (!response.ok) {
    throw new Error(`AI 接口请求失败（${response.status}）：${truncateText(rawText)}`);
  }

  let payload: unknown = rawText;
  try {
    payload = JSON.parse(rawText);
  } catch {
    return rawText;
  }

  const text = extractTextFromResponse(payload, format);
  if (!text) {
    const hint = typeof payload === "object" && payload
      ? ` 可用字段：${truncateText(Object.keys(payload as Record<string, unknown>).join(", "), 120)}`
      : "";
    throw new Error(`AI 响应里没有可提取的文本内容，原始片段：${truncateText(rawText)}${hint}`);
  }

  return text;
}

async function repairJsonText<T>(input: {
  rawText: string;
  schema: z.ZodType<T>;
  example: string;
}) {
  const repairedText = await callAiText({
    system: "你是 JSON 修复助手。",
    maxTokens: 2500,
    prompt: [
      "请把下面内容整理成一个合法 JSON 对象。",
      "要求：只输出 JSON；第一字符必须是 {；最后字符必须是 }；不要 Markdown；不要解释。",
      "目标 JSON 示例：",
      input.example,
      "原始内容：",
      input.rawText,
    ].join("\n\n"),
  });

  const repaired = parseJsonFromText(repairedText);
  return input.schema.parse(repaired);
}

async function createCompatibilityJson<T>(input: {
  system: string;
  prompt: string;
  schema: z.ZodType<T>;
  example: string;
  maxTokens?: number;
}) {
  const text = await callAiText({
    system: input.system,
    prompt: [
      input.prompt,
      "你的回答必须满足：只输出一个 JSON 对象；不要 Markdown；不要解释；第一字符必须是 {；最后字符必须是 }。",
      "请严格参考以下 JSON 结构示例：",
      input.example,
    ].join("\n\n"),
    maxTokens: input.maxTokens,
  });

  try {
    const parsed = parseJsonFromText(text);
    return input.schema.parse(parsed);
  } catch {
    return repairJsonText({
      rawText: text,
      schema: input.schema,
      example: input.example,
    });
  }
}

export async function generateReadingArticle(input: {
  topic: string;
  level: ReadingLevel;
  length: ReadingLengthBucket;
}) {
  const [minWords, maxWords] = getReadingWordRange(input.length);
  const example = JSON.stringify({
    title: "文章标题",
    topic: input.topic,
    level: input.level,
    content: "英文正文，分段用\\n\\n",
    summary_cn: "中文摘要",
    grammar_focus: ["语法点1", "语法点2"],
    key_vocabulary: ["word1", "word2"],
  }, null, 2);

  return createCompatibilityJson({
    system: ARTICLE_SYSTEM_PROMPT,
    schema: articleSchema,
    example,
    maxTokens: 4000,
    prompt: [
      `请生成一篇适合 ${input.level} 水平英语阅读训练的英文文章。`,
      `主题：${input.topic}`,
      `篇幅：${input.length}，目标词数区间 ${minWords}-${maxWords}。`,
    ].join("\n\n"),
  }) satisfies Promise<ArticleOutput>;
}

export async function generateReadingPractice(input: {
  articleTitle: string;
  vocabList: Array<{ id: string | null; kind: VocabEntryKind; text: string; note?: string | null }>;
}) {
  const focusLines = input.vocabList.slice(0, 16).map((vocab) => {
    const note = vocab.note?.trim() ? `；备注：${vocab.note.trim()}` : "";
    const id = vocab.id ?? "null";
    return `- [${id}] ${vocab.kind}: ${vocab.text}${note}`;
  });

  const example = JSON.stringify({
    title: "练习标题",
    practice_type: "vocab",
    questions: [
      {
        id: "q1",
        type: "vocab",
        prompt: "题目",
        choices: ["A", "B", "C", "D"],
        answer: "A",
        explanation_cn: "解析",
        related_vocab_entry_id: input.vocabList[0]?.id ?? null,
      },
    ],
  }, null, 2);

  return createCompatibilityJson({
    system: PRACTICE_SYSTEM_PROMPT,
    schema: practiceSchema,
    example,
    maxTokens: 2000,
    prompt: [
      `文章标题：${input.articleTitle}`,
      "请围绕以下词条出题，覆盖单词辨义、搭配和语境理解。",
      focusLines.join("\n"),
    ].join("\n\n"),
  }) satisfies Promise<PracticeOutput>;
}

export async function generateContextualGloss(input: {
  articleTitle: string;
  kind: VocabEntryKind;
  selectedText: string;
  sentence: string;
  paragraph: string;
}) {
  const example = JSON.stringify({
    gloss_cn: "误解的",
  }, null, 2);

  return createCompatibilityJson({
    system: GLOSS_SYSTEM_PROMPT,
    schema: glossSchema,
    example,
    maxTokens: 300,
    prompt: [
      `文章标题：${input.articleTitle}`,
      `词条类型：${input.kind}`,
      `划词内容：${input.selectedText}`,
      `所在句子：${input.sentence}`,
      `所在段落：${input.paragraph}`,
    ].join("\n\n"),
  }) satisfies Promise<GlossOutput>;
}
