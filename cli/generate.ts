import { getDb } from "../core/db.ts";
import { loadConfig } from "../core/config.ts";
import { generateSingle, generateThread, generateIdeas } from "../core/ai/generator.ts";
import { fail, type CliContext } from "./context.ts";

export async function generateCommand(args: string[], ctx: CliContext): Promise<unknown> {
  const db = getDb();
  const config = await loadConfig();

  if (args.length === 0) {
    fail("Usage: tweet generate <topic>", "INVALID_ARGS", {
      examples: ["tweet generate thread <topic>", "tweet generate ideas"],
    });
  }

  if (args[0] === "ideas") {
    const raw = await generateIdeas(db, config, { quiet: ctx.json });
    return { mode: "ideas", raw };
  }

  if (args[0] === "thread") {
    const topic = args.slice(1).join(" ");
    if (!topic) {
      fail("Usage: tweet generate thread <topic>", "INVALID_ARGS");
    }
    const result = await generateThread(db, topic, config, { quiet: ctx.json });
    return { mode: "thread", topic, ...result };
  }

  const topic = args.join(" ");
  const result = await generateSingle(db, topic, config, { quiet: ctx.json });
  return { mode: "single", topic, ...result };
}
