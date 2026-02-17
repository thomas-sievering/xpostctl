import { appendFile, mkdir } from "fs/promises";
import { join } from "path";

const LOG_DIR = join(process.cwd(), ".twitter", "logs");

type LogLevel = "debug" | "info" | "warn" | "error";

export type LogEntry = {
  ts: string;
  level: LogLevel;
  message: string;
  data?: unknown;
};

let initialized = false;

async function ensureLogDir() {
  if (!initialized) {
    await mkdir(LOG_DIR, { recursive: true });
    initialized = true;
  }
}

function getLogFile(): string {
  const date = new Date().toISOString().slice(0, 10);
  return join(LOG_DIR, `${date}.jsonl`);
}

async function write(level: LogLevel, message: string, data?: unknown) {
  await ensureLogDir();
  const entry: LogEntry = {
    ts: new Date().toISOString(),
    level,
    message,
    ...(data !== undefined && { data }),
  };
  await appendFile(getLogFile(), JSON.stringify(entry) + "\n");
}

export const log = {
  debug: (msg: string, data?: unknown) => write("debug", msg, data),
  info: (msg: string, data?: unknown) => write("info", msg, data),
  warn: (msg: string, data?: unknown) => write("warn", msg, data),
  error: (msg: string, data?: unknown) => write("error", msg, data),
};
