import { getDb, createTweet, getTweet, updateTweet, deleteTweetRow } from "../core/db.ts";
import { c } from "../core/colors.ts";
import { fail, type CliContext } from "./context.ts";

export function draftCommand(args: string[], ctx: CliContext): unknown {
  const db = getDb();

  // tweet draft --edit <id> <new text>
  if (args[0] === "--edit") {
    const id = args[1];
    const text = args.slice(2).join(" ");
    if (!id || !text) {
      fail("Usage: tweet draft --edit <id> <new text>", "INVALID_ARGS");
    }
    const tweet = getTweet(db, id);
    if (!tweet) {
      fail(`Tweet not found: ${id}`, "NOT_FOUND");
    }
    if (tweet.status !== "draft") {
      fail(`Can only edit drafts (current status: ${tweet.status})`, "CONFLICT");
    }
    let warning: string | undefined;
    if (text.length > 280) {
      warning = `text is ${text.length} chars (max 280)`;
      if (!ctx.json) {
        console.log(`  ${c.warn("Warning:")} ${warning}`);
      }
    }
    updateTweet(db, id, { content: text });
    const updated = getTweet(db, id);
    if (!ctx.json) {
      console.log(`  ${c.ok("Updated")} ${c.muted(id)}`);
    }
    return { action: "edited", tweet: updated, warning };
  }

  // tweet draft --delete <id>
  if (args[0] === "--delete") {
    const id = args[1];
    if (!id) {
      fail("Usage: tweet draft --delete <id>", "INVALID_ARGS");
    }
    const tweet = getTweet(db, id);
    if (!tweet) {
      fail(`Tweet not found: ${id}`, "NOT_FOUND");
    }
    deleteTweetRow(db, id);
    if (!ctx.json) {
      console.log(`  ${c.ok("Deleted")} ${c.muted(id)}`);
    }
    return { action: "deleted", id };
  }

  // tweet draft <text>
  const text = args.join(" ");
  if (!text) {
    fail("Usage: tweet draft <text>", "INVALID_ARGS", {
      examples: ["tweet draft --edit <id> <new text>"],
    });
  }

  let warning: string | undefined;
  if (text.length > 280) {
    warning = `text is ${text.length} chars (max 280)`;
    if (!ctx.json) {
      console.log(`  ${c.warn("Warning:")} ${warning}`);
    }
  }

  const tweet = createTweet(db, { content: text });
  if (!ctx.json) {
    console.log(`  ${c.ok("Created draft")} ${c.muted(tweet.id)}`);
    console.log(`  ${c.label(tweet.content)}`);
  }
  return { action: "created", tweet, warning };
}
