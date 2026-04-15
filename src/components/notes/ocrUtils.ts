export interface OcrWordBox {
  text: string;
  bbox: {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
  };
}

export interface SelectableOcrWord {
  id: string;
  text: string;
  leftPct: number;
  topPct: number;
  widthPct: number;
  heightPct: number;
}

export interface OcrRecognitionResult {
  text: string;
  words: SelectableOcrWord[];
  rawWords: OcrWordBox[];
}

type TesseractWordLike = {
  text?: unknown;
  bbox?: {
    x0?: unknown;
    y0?: unknown;
    x1?: unknown;
    y1?: unknown;
  };
};

let workerPromise: Promise<{
  recognize: (image: string) => Promise<{ data?: { text?: string; words?: TesseractWordLike[] } }>;
  terminate: () => Promise<unknown>;
}> | null = null;

const resultCache = new Map<string, Promise<OcrRecognitionResult>>();

function roundPct(value: number): number {
  return Number(value.toFixed(2));
}

export function normalizeOcrText(text: string): string {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

export function buildSelectableOcrWords(
  words: OcrWordBox[],
  imageWidth: number,
  imageHeight: number
): SelectableOcrWord[] {
  if (imageWidth <= 0 || imageHeight <= 0) return [];

  return words
    .map((word, index) => {
      const text = word.text.trim();
      const { x0, y0, x1, y1 } = word.bbox;
      const width = x1 - x0;
      const height = y1 - y0;

      if (!text || width <= 0 || height <= 0) return null;

      return {
        id: `ocr-word-${index}`,
        text,
        leftPct: roundPct((x0 / imageWidth) * 100),
        topPct: roundPct((y0 / imageHeight) * 100),
        widthPct: roundPct((width / imageWidth) * 100),
        heightPct: roundPct((height / imageHeight) * 100),
      };
    })
    .filter((word): word is SelectableOcrWord => Boolean(word));
}

function toOcrWordBoxes(words: TesseractWordLike[] | undefined): OcrWordBox[] {
  if (!words?.length) return [];

  return words
    .map((word) => {
      if (typeof word.text !== "string" || !word.bbox) return null;

      const { x0, y0, x1, y1 } = word.bbox;
      if (
        typeof x0 !== "number" ||
        typeof y0 !== "number" ||
        typeof x1 !== "number" ||
        typeof y1 !== "number"
      ) {
        return null;
      }

      return {
        text: word.text,
        bbox: { x0, y0, x1, y1 },
      };
    })
    .filter((word): word is OcrWordBox => Boolean(word));
}

async function getWorker() {
  if (!workerPromise) {
    workerPromise = (async () => {
      const { createWorker } = await import("tesseract.js");
      return createWorker("eng+chi_sim");
    })();
  }

  return workerPromise;
}

export async function recognizeImageText(src: string): Promise<OcrRecognitionResult> {
  if (!src) {
    return {
      text: "",
      words: [],
      rawWords: [],
    };
  }

  const cached = resultCache.get(src);
  if (cached) return cached;

  const task = (async () => {
    const worker = await getWorker();
    const result = await worker.recognize(src);
    const rawWords = toOcrWordBoxes(result.data?.words);

    const width = Math.max(
      ...rawWords.map((word) => word.bbox.x1),
      1
    );
    const height = Math.max(
      ...rawWords.map((word) => word.bbox.y1),
      1
    );

    return {
      text: normalizeOcrText(result.data?.text ?? ""),
      words: buildSelectableOcrWords(rawWords, width, height),
      rawWords,
    };
  })();

  resultCache.set(src, task);
  return task;
}

export function clearOcrCache(): void {
  resultCache.clear();
}

export async function terminateOcrWorker(): Promise<void> {
  if (!workerPromise) return;
  const worker = await workerPromise;
  await worker.terminate();
  workerPromise = null;
}
