import { getDb, getTweet, getThread, updateTweet } from "../core/db.ts";
import { loadConfig } from "../core/config.ts";
import { TwitterClient } from "../core/twitter/client.ts";
import { c } from "../core/colors.ts";
import { fail, type CliContext } from "./context.ts";

export async function postCommand(args: string[], ctx: CliContext): Promise<unknown> {
  const db = getDb();
  const config = await loadConfig();

  const dryRun = args.includes("--dry");
  const id = args.find((a) => !a.startsWith("--"));

  if (!id) {
    fail("Usage: tweet post <id> [--dry]", "INVALID_ARGS");
  }

  const tweet = getTweet(db, id);
  if (!tweet) {
    fail(`Tweet not found: ${id}`, "NOT_FOUND");
  }

  if (tweet.status === "posted") {
    fail(`Already posted (tweet ID: ${tweet.tweet_id})`, "CONFLICT");
  }

  const client = new TwitterClient(config.twitter, dryRun, ctx.json);

  // Check if this is part of a thread
  if (tweet.thread_id) {
    const thread = getThread(db, tweet.thread_id);
    if (!ctx.json) {
      console.log(`  ${c.muted(`Posting thread (${thread.length} tweets)...`)}`);
    }

    const texts = thread.map((t) => t.content);
    const results = await client.postThread(texts);

    for (let i = 0; i < thread.length; i++) {
      const t = thread[i]!;
      const result = results[i];
      updateTweet(db, t.id, {
        status: "posted",
        tweet_id: result?.id ?? null,
        posted_at: new Date().toISOString(),
      });
    }

    const updatedThread = getThread(db, tweet.thread_id);
    if (!ctx.json) {
      console.log(`  ${c.ok("Thread posted")} (${thread.length} tweets)`);
    }
    return { mode: "thread", dryRun, count: thread.length, tweets: updatedThread };
  }

  // Single tweet
  try {
    const result = await client.postTweet(tweet.content);
    updateTweet(db, tweet.id, {
      status: "posted",
      tweet_id: result.id,
      posted_at: new Date().toISOString(),
    });
    const posted = getTweet(db, tweet.id);
    if (!ctx.json) {
      console.log(`  ${c.ok("Posted")} ${c.muted(tweet.id)} -> ${c.label(result.id)}`);
    }
    return { mode: "single", dryRun, tweet: posted, post: result };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    updateTweet(db, tweet.id, { status: "failed" });
    fail(`Failed: ${msg}`, "POST_FAILED", { id: tweet.id });
  }
}
