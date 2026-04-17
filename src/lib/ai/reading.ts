import { z } from "zod";
import { appendAiDebugLog } from "@/lib/ai/debug-log";
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

function resolveAiRequestUrl(rawUrl: string) {
  const url = new URL(rawUrl);
  const pathname = url.pathname.replace(/\/+$/, "");

  if (
    pathname.endsWith("/chat/completions") ||
    pathname.endsWith("/messages")
  ) {
    return url.toString();
  }

  if (
    pathname.endsWith("/api/paas/v4") ||
    pathname.endsWith("/api/coding/paas/v4")
  ) {
    url.pathname = `${pathname}/chat/completions`;
    return url.toString();
  }

  return url.toString();
}

function isAiDebugEnabled() {
  return process.env.AI_DEBUG_LOGS === "1";
}

async function writeAiLog(level: "info" | "error", event: string, payload: Record<string, unknown>) {
  try {
    await appendAiDebugLog({
      timestamp: new Date().toISOString(),
      level,
      event,
      source: "ai",
      payload,
    });
  } catch (error) {
    console.error("[ai] failed to persist debug log", error);
  }
}

function logAiDebug(event: string, payload: Record<string, unknown>) {
  if (!isAiDebugEnabled()) return;
  void writeAiLog("info", event, payload);
}

function logAiError(event: string, payload: Record<string, unknown>) {
  void writeAiLog("error", event, payload);
}

function truncateText(text: string, maxLength = 220) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1)}…`;
}

function maskApiKey(apiKey: string | undefined) {
  if (!apiKey) return "missing";
  if (apiKey.length <= 8) return "***";
  return `${apiKey.slice(0, 4)}***${apiKey.slice(-4)}`;
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
  disableThinking?: boolean;
  temperature?: number;
}) {
  const url = process.env.AI_API_URL;
  const apiKey = process.env.AI_API_KEY;
  const format = (process.env.AI_API_FORMAT || "openai") as AiFormat;

  if (!url) {
    throw new Error("AI_API_URL environment variable is not set");
  }

  const requestUrl = resolveAiRequestUrl(url);

  logAiDebug("request:start", {
    url: requestUrl,
    format,
    model: process.env.AI_MODEL ?? null,
    maxTokens: input.maxTokens ?? 4000,
    disableThinking: input.disableThinking ?? false,
    temperature: input.temperature ?? null,
    apiKey: maskApiKey(apiKey),
    systemPreview: truncateText(input.system, 120),
    promptPreview: truncateText(input.prompt, 240),
  });

  const response = await fetch(requestUrl, {
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
      ...(typeof input.temperature === "number" ? { temperature: input.temperature } : {}),
      ...(input.disableThinking ? { thinking: { type: "disabled" } } : {}),
    }),
    cache: "no-store",
  });

  const rawText = await response.text();

  logAiDebug("request:response", {
    status: response.status,
    ok: response.ok,
    bodyPreview: truncateText(rawText, 400),
  });

  if (!response.ok) {
    logAiError("request:failed", {
      status: response.status,
      bodyPreview: truncateText(rawText, 400),
    });
    throw new Error(`AI 接口请求失败（${response.status}）：${truncateText(rawText)}`);
  }

  let payload: unknown = rawText;
  try {
    payload = JSON.parse(rawText);
  } catch {
    logAiDebug("response:text", {
      extractedPreview: truncateText(rawText, 240),
    });
    return rawText;
  }

  const text = extractTextFromResponse(payload, format);
  if (!text) {
    const hint = typeof payload === "object" && payload
      ? ` 可用字段：${truncateText(Object.keys(payload as Record<string, unknown>).join(", "), 120)}`
      : "";
    logAiError("response:empty", {
      rawPreview: truncateText(rawText, 400),
      format,
    });
    throw new Error(`AI 响应里没有可提取的文本内容，原始片段：${truncateText(rawText)}${hint}`);
  }

  logAiDebug("response:parsed", {
    extractedPreview: truncateText(text, 320),
  });

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
    disableThinking: true,
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
  disableThinking?: boolean;
  temperature?: number;
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
    disableThinking: input.disableThinking,
    temperature: input.temperature,
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
  angle?: string;
  avoidTitles?: string[];
  avoidTopics?: string[];
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

  const avoidTitles = input.avoidTitles?.filter((item) => item.trim()).slice(0, 6) ?? [];
  const avoidTopics = input.avoidTopics?.filter((item) => item.trim()).slice(0, 6) ?? [];
  const avoidBlock =
    avoidTitles.length > 0 || avoidTopics.length > 0
      ? [
          "请避开用户最近刚生成过的题材和标题，不要重复写相同中心内容。",
          avoidTitles.length > 0 ? `最近标题：${avoidTitles.map((item) => JSON.stringify(item)).join("、")}` : "",
          avoidTopics.length > 0 ? `最近主题：${avoidTopics.map((item) => JSON.stringify(item)).join("、")}` : "",
        ]
          .filter(Boolean)
          .join("\n")
      : "";

  const result: ArticleOutput = await createCompatibilityJson({
    system: ARTICLE_SYSTEM_PROMPT,
    schema: articleSchema,
    example,
    maxTokens: 4000,
    disableThinking: true,
    temperature: 0.9,
    prompt: [
      `请生成一篇适合 ${input.level} 水平英语阅读训练的英文文章。`,
      `主题：${input.topic}`,
      input.angle ? `本次聚焦角度：${input.angle}` : "",
      `篇幅：${input.length}，目标词数区间 ${minWords}-${maxWords}。`,
      avoidBlock,
      reuseBlock,
      "务必围绕本次聚焦角度展开，不要偷换成其他常见题材。",
    ]
      .filter(Boolean)
      .join("\n\n"),
  });

  logAiDebug("article:result", {
    title: result.title,
    topic: result.topic,
    level: result.level,
    angle: input.angle ?? null,
    contentPreview: truncateText(result.content, 320),
    summaryPreview: truncateText(result.summary_cn, 120),
  });

  return result;
}

function cleanFastGlossRaw(raw: string): string | null {
  const normalized = raw
    .replace(/\r/g, "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[*#>`_-]+/g, " ")
    .replace(/\b\d+\s*[.)、:：-]?\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const match = normalized.match(/[\u4e00-\u9fff]{2,12}/);
  return match?.[0] ?? null;
}

export async function generateContextualGlossFast(input: {
  kind: VocabEntryKind;
  selectedText: string;
  sentence: string;
}) {
  try {
    const raw = await callAiText({
      system: FAST_GLOSS_SYSTEM,
      maxTokens: 60,
      disableThinking: true,
      prompt: [
        `句子：${input.sentence}`,
        `${input.kind === "phrase" ? "短语" : "词"}：${input.selectedText}`,
        "输出：",
      ].join("\n"),
    });
    const gloss = cleanFastGlossRaw(raw);
    logAiDebug("gloss:fast", {
      kind: input.kind,
      selectedText: input.selectedText,
      sentencePreview: truncateText(input.sentence, 160),
      rawPreview: truncateText(raw, 120),
      gloss,
    });
    return gloss;
  } catch (error) {
    logAiError("gloss:fast-failed", {
      kind: input.kind,
      selectedText: input.selectedText,
      sentencePreview: truncateText(input.sentence, 160),
      error: error instanceof Error ? error.message : "未知错误",
    });
    return null;
  }
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

  const result: GlossOutput = await createCompatibilityJson({
    system: GLOSS_SYSTEM_PROMPT,
    schema: glossSchema,
    example,
    maxTokens: 300,
    disableThinking: true,
    prompt: [
      `文章标题：${input.articleTitle}`,
      `词条类型：${input.kind}`,
      `划词内容：${input.selectedText}`,
      `所在句子：${input.sentence}`,
      `所在段落：${input.paragraph}`,
    ].join("\n\n"),
  });

  logAiDebug("gloss:result", {
    kind: input.kind,
    selectedText: input.selectedText,
    gloss: result.gloss_cn,
  });

  return result;
}
