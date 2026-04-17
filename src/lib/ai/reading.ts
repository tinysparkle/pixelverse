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

const GLOSS_SYSTEM_PROMPT = [
  "你是英语阅读词义标注助手。",
  "请根据用户划出的英文单词或短语，以及它所在句子和段落，给出最贴合当前语境的简短中文义项。",
  "输出要像学生写在课本上的上方批注，简洁、自然、不要书面腔。",
  "gloss_cn 只允许 2 到 12 个汉字，不能是整句翻译，不能带括号、编号或解释。",
  "如果是短语，优先给短语义；如果是单词，优先给句中义，不要机械词典硬译。",
  "输出必须严格遵守结构化格式。",
].join("\n");

const FAST_GLOSS_SYSTEM = [
  "你是英文阅读的中文批注助手。",
  "用户会给你一段英文句子以及句中需要批注的单词或短语，你要结合整句的语境判断它在这句话里的意思，给出最贴合的简短中文义。",
  "严格要求：",
  "1. 只输出 2-8 个汉字的中文义，不要英文、拼音、标点、编号、引号、括号或解释。",
  "2. 必须按句中用法选义，不要直接给脱离语境的词典本义。",
  "3. 如果是短语，给短语的整体义；如果是单词，给它在这句里的具体义。",
  "示例：",
  "句子：I prefer physical books to e-books.",
  "词：physical",
  "输出：纸质的",
  "反例（禁止）：物理",
  "示例：",
  "句子：She ran into an old friend at the airport.",
  "词：ran into",
  "输出：偶然遇到",
  "反例（禁止）：撞上",
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

const glossSchema = z.object({
  gloss_cn: z.string().min(2).max(12),
});

type ArticleOutput = z.infer<typeof articleSchema>;
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
  wordbookReuse?: string[];
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

  const reuse = input.wordbookReuse?.filter((t) => t.trim()).slice(0, 8) ?? [];
  const reuseBlock =
    reuse.length > 0
      ? [
          "以下英文词或短语来自用户自己的复习生词本，请在正文中自然融入其中若干（不必全部出现；允许合理的词形或屈折变化），与文章主题和语气一致，不要生硬罗列。",
          `生词本条目：${reuse.map((t) => JSON.stringify(t)).join("、")}`,
        ].join("\n")
      : "";

  return createCompatibilityJson({
    system: ARTICLE_SYSTEM_PROMPT,
    schema: articleSchema,
    example,
    maxTokens: 4000,
    prompt: [
      `请生成一篇适合 ${input.level} 水平英语阅读训练的英文文章。`,
      `主题：${input.topic}`,
      `篇幅：${input.length}，目标词数区间 ${minWords}-${maxWords}。`,
      reuseBlock,
    ]
      .filter(Boolean)
      .join("\n\n"),
  }) satisfies Promise<ArticleOutput>;
}

function cleanFastGlossRaw(raw: string): string | null {
  const token = raw.trim().split(/[\s\n]+/)[0] ?? "";
  const stripped = token
    .replace(/^[`"'「『（(【\[]+/, "")
    .replace(/[`"'」』）)】\].。!！?？,，;；:：]+$/, "")
    .slice(0, 12);
  return stripped || null;
}

export async function generateContextualGlossFast(input: {
  kind: VocabEntryKind;
  selectedText: string;
  sentence: string;
}) {
  const raw = await callAiText({
    system: FAST_GLOSS_SYSTEM,
    maxTokens: 60,
    prompt: [
      `句子：${input.sentence}`,
      `${input.kind === "phrase" ? "短语" : "词"}：${input.selectedText}`,
      "输出：",
    ].join("\n"),
  });
  return cleanFastGlossRaw(raw);
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
