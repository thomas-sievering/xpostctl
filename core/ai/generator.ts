/**
 * Claude-powered tweet/thread generator.
 * Uses Claude Agent SDK with subscription auth (same pattern as nexus.v3).
 */

import { query as sdkQuery } from "@anthropic-ai/claude-agent-sdk";
import type { Database } from "bun:sqlite";
import { createTweet, saveGeneration, newId, type Tweet } from "../db.ts";
import { log } from "../logger.ts";
import { c } from "../colors.ts";
import type { TwitterConfig } from "../config.ts";
import { singleTweetPrompt, threadPrompt, ideasPrompt } from "./prompts.ts";

type GenerateResult = {
  tweets: Tweet[];
  raw: string;
};

type GenerateOptions = {
  quiet?: boolean;
};

async function runPrompt(systemPrompt: string, userPrompt: string): Promise<string> {
  const ac = new AbortController();
  const timeout = setTimeout(() => ac.abort(), 60_000);

  try {
    const stream = sdkQuery({
      prompt: userPrompt,
      options: {
        systemPrompt,
        model: "sonnet",
        maxTurns: 1,
        abortController: ac,
        permissionMode: "bypassPermissions" as const,
        allowDangerouslySkipPermissions: true,
        persistSession: false,
        settingSources: [],
        disallowedTools: [
          "Bash", "Read", "Write", "Edit", "Glob", "Grep",
          "WebFetch", "WebSearch", "AskUserQuestion", "EnterPlanMode",
          "Task", "NotebookEdit",
        ],
      },
    });

    let result = "";
    let model = "";

    for await (const msg of stream) {
      if (msg.type === "system" && msg.subtype === "init") {
        model = (msg as { model?: string }).model ?? "unknown";
      }
      if (msg.type === "assistant") {
        const blocks = (msg as { message?: { content?: Array<{ type: string; text?: string }> } }).message?.content;
        if (Array.isArray(blocks)) {
          for (const block of blocks) {
            if (block.type === "text" && block.text) {
              result += block.text;
            }
          }
        }
      }
    }

    return result.trim();
  } finally {
    clearTimeout(timeout);
    ac.abort();
  }
}

export async function generateSingle(
  db: Database,
  topic: string,
  config: TwitterConfig,
  opts: GenerateOptions = {},
): Promise<GenerateResult> {
  if (!opts.quiet) {
    console.log(`  ${c.muted("Generating tweet about:")} ${topic}`);
  }

  const systemPrompt = singleTweetPrompt(config);
  const userPrompt = `Write a tweet about: ${topic}`;

  const raw = await runPrompt(systemPrompt, userPrompt);
  saveGeneration(db, userPrompt, raw, "sonnet");

  // Trim to 280 chars if needed
  const content = raw.slice(0, 280);
  const tweet = createTweet(db, { content, tags: topic });

  if (!opts.quiet) {
    console.log(`  ${c.ok("Generated")} ${c.muted(tweet.id)}`);
    console.log(`  ${c.label(content)}`);
  }

  return { tweets: [tweet], raw };
}

export async function generateThread(
  db: Database,
  topic: string,
  config: TwitterConfig,
  opts: GenerateOptions = {},
): Promise<GenerateResult> {
  if (!opts.quiet) {
    console.log(`  ${c.muted("Generating thread about:")} ${topic}`);
  }

  const systemPrompt = threadPrompt(config);
  const userPrompt = `Write a thread about: ${topic}`;

  const raw = await runPrompt(systemPrompt, userPrompt);
  saveGeneration(db, userPrompt, raw, "sonnet");

  // Parse thread: split by --- separator
  const parts = raw
    .split(/\n---\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const threadId = newId();
  const tweets: Tweet[] = [];

  for (let i = 0; i < parts.length; i++) {
    const content = parts[i]!.slice(0, 280);
    const tweet = createTweet(db, {
      content,
      thread_id: threadId,
      thread_pos: i,
      tags: topic,
    });
    tweets.push(tweet);
    if (!opts.quiet) {
      console.log(`  ${c.ok(`[${i + 1}/${parts.length}]`)} ${c.label(content.slice(0, 80))}${content.length > 80 ? "..." : ""}`);
    }
  }

  if (!opts.quiet) {
    console.log(`  ${c.muted(`Thread ${threadId} - ${tweets.length} tweets`)}`);
  }
  return { tweets, raw };
}

export async function generateIdeas(
  db: Database,
  config: TwitterConfig,
  opts: GenerateOptions = {},
): Promise<string> {
  if (!opts.quiet) {
    console.log(`  ${c.muted("Generating tweet ideas...")}`);
  }

  const systemPrompt = ideasPrompt(config);
  const userPrompt = "Generate 10 tweet ideas for this week.";

  const raw = await runPrompt(systemPrompt, userPrompt);
  saveGeneration(db, userPrompt, raw, "sonnet");

  if (!opts.quiet) {
    console.log();
    console.log(raw);
    console.log();
  }

  return raw;
}
