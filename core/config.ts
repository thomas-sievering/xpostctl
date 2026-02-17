import { readFile, writeFile, mkdir } from "fs/promises";
import { join, dirname } from "path";
import { log } from "./logger.ts";

export type TwitterConfig = {
  twitter: {
    apiKey: string;
    apiSecret: string;
    accessToken: string;
    accessSecret: string;
  };
  ai: {
    topics: string[];
    tone: string;
    avoid: string[];
  };
};

export const DEFAULT_CONFIG: TwitterConfig = {
  twitter: {
    apiKey: "",
    apiSecret: "",
    accessToken: "",
    accessSecret: "",
  },
  ai: {
    topics: ["TypeScript", "AI/ML", "LLMs", "open source", "developer tools"],
    tone: "witty, concise, technical but accessible",
    avoid: ["engagement bait", "generic advice", "hashtag spam"],
  },
};

const CONFIG_PATH = join(process.cwd(), ".twitter", "config.json");
const X_ENV_PATH = join(process.cwd(), "x.env");

let _cached: TwitterConfig | null = null;
let _dotenvLoaded = false;

export async function loadConfig(): Promise<TwitterConfig> {
  if (_cached) return _cached;
  await loadDotEnvIfPresent();

  let raw: string;
  try {
    raw = await readFile(CONFIG_PATH, "utf-8");
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      await mkdir(dirname(CONFIG_PATH), { recursive: true });
      await writeFile(CONFIG_PATH, JSON.stringify(DEFAULT_CONFIG, null, 2) + "\n", "utf-8");
      await log.info("config: created with defaults", { path: CONFIG_PATH });
      _cached = applyEnvOverrides({ ...DEFAULT_CONFIG, twitter: { ...DEFAULT_CONFIG.twitter } });
      return _cached;
    }
    throw new Error(`Failed to read config: ${(err as Error).message}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Invalid JSON in ${CONFIG_PATH}`);
  }

  // Merge with defaults so missing keys get filled in
  const config = deepMerge(DEFAULT_CONFIG, parsed as Record<string, unknown>) as TwitterConfig;
  _cached = applyEnvOverrides(config);
  await log.info("config: loaded", { path: CONFIG_PATH });
  return _cached;
}

/** Reset cached config (useful for tests) */
export function resetConfigCache(): void {
  _cached = null;
  _dotenvLoaded = false;
}

function deepMerge(defaults: Record<string, unknown>, overrides: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = { ...defaults };
  for (const key of Object.keys(overrides)) {
    const dVal = defaults[key];
    const oVal = overrides[key];
    if (
      dVal && oVal &&
      typeof dVal === "object" && typeof oVal === "object" &&
      !Array.isArray(dVal) && !Array.isArray(oVal)
    ) {
      result[key] = deepMerge(dVal as Record<string, unknown>, oVal as Record<string, unknown>);
    } else {
      result[key] = oVal;
    }
  }
  return result;
}

async function loadDotEnvIfPresent(): Promise<void> {
  if (_dotenvLoaded) return;
  _dotenvLoaded = true;

  const customEnvPath = process.env.XPOSTCTL_ENV_FILE;
  const candidates = [
    customEnvPath,
    X_ENV_PATH,
  ].filter((v): v is string => Boolean(v));

  for (const envPath of candidates) {
    let raw: string;
    try {
      raw = await readFile(envPath, "utf-8");
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "ENOENT") continue;
      throw new Error(`Failed to read ${envPath}: ${(err as Error).message}`);
    }

    for (const [key, value] of Object.entries(parseDotEnv(raw))) {
      if (!process.env[key]) process.env[key] = value;
    }
  }
}

function parseDotEnv(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    const key = match[1]!;
    let value = match[2]!.trim();
    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function applyEnvOverrides(config: TwitterConfig): TwitterConfig {
  const apiKey = process.env.X_API_KEY ?? process.env.TWITTER_API_KEY;
  const apiSecret = process.env.X_API_SECRET ?? process.env.TWITTER_API_SECRET;
  const accessToken = process.env.X_ACCESS_TOKEN ?? process.env.TWITTER_ACCESS_TOKEN;
  const accessSecret = process.env.X_ACCESS_SECRET ?? process.env.TWITTER_ACCESS_SECRET;

  return {
    ...config,
    twitter: {
      ...config.twitter,
      apiKey: apiKey ?? config.twitter.apiKey,
      apiSecret: apiSecret ?? config.twitter.apiSecret,
      accessToken: accessToken ?? config.twitter.accessToken,
      accessSecret: accessSecret ?? config.twitter.accessSecret,
    },
  };
}
