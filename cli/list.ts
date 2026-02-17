import { getDb, listTweets, type Tweet } from "../core/db.ts";
import { c, section } from "../core/colors.ts";
import { fail, type CliContext } from "./context.ts";

const STATUS_COLORS: Record<Tweet["status"], (s: string) => string> = {
  draft: c.label,
  posted: c.ok,
  failed: c.error,
};

export function listCommand(args: string[], ctx: CliContext): unknown {
  const db = getDb();
  const filter = args[0];

  if (filter && !["drafts", "draft", "posted", "failed"].includes(filter)) {
    fail(`Invalid filter: ${filter}`, "INVALID_ARGS", {
      validFilters: ["drafts", "posted", "failed"],
    });
  }

  // Normalize "drafts" -> "draft"
  const status = (filter === "drafts" ? "draft" : filter) as Tweet["status"] | undefined;
  const tweets = listTweets(db, status);

  if (ctx.json) {
    return { status: status ?? null, count: tweets.length, tweets };
  }

  if (tweets.length === 0) {
    console.log(`  ${c.muted("No tweets found")}`);
    return { status: status ?? null, count: 0, tweets };
  }

  const title = status ? `${status} (${tweets.length})` : `All tweets (${tweets.length})`;
  console.log(`\n  ${section(title)}\n`);

  for (const tweet of tweets) {
    const statusColor = STATUS_COLORS[tweet.status] ?? c.muted;
    const preview = tweet.content.slice(0, 60) + (tweet.content.length > 60 ? "..." : "");
    const meta: string[] = [];

    if (tweet.thread_id) {
      meta.push(`thread:${tweet.thread_pos}`);
    }
    if (tweet.tweet_id) {
      meta.push(`tw:${tweet.tweet_id}`);
    }
    if (tweet.tags) {
      meta.push(tweet.tags);
    }

    const metaStr = meta.length > 0 ? ` ${c.dim(meta.join(" · "))}` : "";
    console.log(`  ${c.muted(tweet.id)} ${statusColor(`[${tweet.status}]`)} ${preview}${metaStr}`);
  }
  console.log();
  return { status: status ?? null, count: tweets.length, tweets };
}
