import { getDb, getTweet } from "../core/db.ts";
import { c } from "../core/colors.ts";
import { fail, type CliContext } from "./context.ts";

export function getCommand(args: string[], ctx: CliContext): unknown {
  const db = getDb();
  const id = args[0];

  if (!id) {
    fail("Usage: tweet get <id>", "INVALID_ARGS");
  }

  const tweet = getTweet(db, id);
  if (!tweet) {
    fail(`Tweet not found: ${id}`, "NOT_FOUND");
  }

  if (!ctx.json) {
    console.log(`\n  ${c.label(tweet.id)} ${c.ok(`[${tweet.status}]`)}`);
    console.log(`  ${tweet.content}`);
    if (tweet.tweet_id) console.log(`  ${c.muted(`tweet_id: ${tweet.tweet_id}`)}`);
    if (tweet.created_at) console.log(`  ${c.muted(`created: ${tweet.created_at}`)}`);
    if (tweet.posted_at) console.log(`  ${c.muted(`posted: ${tweet.posted_at}`)}`);
    console.log();
  }

  return { tweet };
}

