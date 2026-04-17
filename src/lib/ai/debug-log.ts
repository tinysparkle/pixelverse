import { mkdir, readFile, appendFile } from "node:fs/promises";
import path from "node:path";

export type AiDebugLogEntry = {
  timestamp: string;
  level: "info" | "error";
  event: string;
  source?: string;
  payload: Record<string, unknown>;
};

const logDir = path.join(process.cwd(), "logs");
const logPath = path.join(logDir, "ai-debug.log");

export function getAiDebugLogPath() {
  return logPath;
}

export async function appendAiDebugLog(entry: AiDebugLogEntry) {
  await mkdir(logDir, { recursive: true });
  await appendFile(logPath, `${JSON.stringify(entry)}\n`, "utf8");
}

export async function readAiDebugLogs(limit = 40) {
  try {
    const content = await readFile(logPath, "utf8");
    return content
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(-limit)
      .map((line) => JSON.parse(line) as AiDebugLogEntry)
      .reverse();
  } catch {
    return [];
  }
}
