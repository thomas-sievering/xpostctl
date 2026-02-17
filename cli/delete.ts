import { deleteTweetRow, getDb, getTweet } from "../core/db.ts";
import { loadConfig } from "../core/config.ts";
import { TwitterClient } from "../core/twitter/client.ts";
import { c } from "../core/colors.ts";
import { fail, type CliContext } from "./context.ts";

export async function deleteCommand(args: string[], ctx: CliContext): Promise<unknown> {
  const db = getDb();
  const dryRun = args.includes("--dry");
  const id = args.find((a) => !a.startsWith("--"));

  if (!id) {
    fail("Usage: tweet delete <id> [--dry]", "INVALID_ARGS");
  }

  const tweet = getTweet(db, id);
  if (!tweet) {
    fail(`Tweet not found: ${id}`, "NOT_FOUND");
  }

  let remoteDeleted = false;
  if (tweet.tweet_id) {
    const config = await loadConfig();
    const client = new TwitterClient(config.twitter, dryRun, ctx.json);
    await client.deleteTweet(tweet.tweet_id);
    remoteDeleted = true;
  }

  deleteTweetRow(db, tweet.id);

  if (!ctx.json) {
    if (remoteDeleted) {
      console.log(`  ${c.ok("Deleted")} ${c.muted(tweet.id)} (${tweet.tweet_id})`);
    } else {
      console.log(`  ${c.ok("Deleted local draft")} ${c.muted(tweet.id)}`);
    }
  }

  return {
    id: tweet.id,
    status: tweet.status,
    dryRun,
    remoteDeleted,
    remoteTweetId: tweet.tweet_id,
  };
}

