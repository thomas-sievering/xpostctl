/**
 * CLI entry point - simple process.argv routing.
 * Usage: bun cli/index.ts <command> [args...]
 */

import { c, section } from "../core/colors.ts";
import { CliCommandError, type CliContext } from "./context.ts";
import { draftCommand } from "./draft.ts";
import { listCommand } from "./list.ts";
import { postCommand } from "./post.ts";
import { generateCommand } from "./generate.ts";
import { getCommand } from "./get.ts";
import { deleteCommand } from "./delete.ts";

const COMMANDS: Record<string, string> = {
  draft: "Create, edit, or delete a local draft",
  generate: "AI-generate tweet(s) about a topic",
  post: "Post a draft immediately",
  list: "List tweets by status",
  get: "Get one tweet by local id",
  delete: "Delete a tweet by local id (and remote if posted)",
};

function showHelp(): void {
  console.log(`\n  ${section("xpostctl - X Posting Toolkit")}\n`);
  for (const [cmd, desc] of Object.entries(COMMANDS)) {
    console.log(`  ${c.label(`tweet ${cmd}`.padEnd(24))} ${c.muted(desc)}`);
  }
  console.log();
  console.log(`  ${c.muted("Global flags:")}`);
  console.log(`  ${c.dim("  --json   machine-readable output")}`);
  console.log();
  console.log(`  ${c.muted("Examples:")}`);
  console.log(`  ${c.dim("  tweet draft \"My first tweet\"")}`);
  console.log(`  ${c.dim("  tweet generate \"bun runtime\"")}`);
  console.log(`  ${c.dim("  tweet list drafts --json")}`);
  console.log(`  ${c.dim("  tweet post abc123 --dry")}`);
  console.log(`  ${c.dim("  tweet get abc123 --json")}`);
  console.log();
}

function parseGlobalArgs(argv: string[]): { command?: string; rest: string[]; ctx: CliContext } {
  const json = argv.includes("--json");
  const args = argv.filter((a) => a !== "--json");
  return {
    command: args[0],
    rest: args.slice(1),
    ctx: { json },
  };
}

async function runCommand(command: string, rest: string[], ctx: CliContext): Promise<unknown> {
  switch (command) {
    case "draft":
      return draftCommand(rest, ctx);
    case "list":
      return listCommand(rest, ctx);
    case "post":
      return postCommand(rest, ctx);
    case "generate":
      return generateCommand(rest, ctx);
    case "get":
      return getCommand(rest, ctx);
    case "delete":
      return deleteCommand(rest, ctx);
    default:
      throw new CliCommandError(`Unknown command: ${command}`, "INVALID_COMMAND", {
        command,
        available: Object.keys(COMMANDS),
      });
  }
}

async function main(): Promise<void> {
  const parsed = parseGlobalArgs(process.argv.slice(2));
  const { command, rest, ctx } = parsed;

  if (!command || command === "help" || command === "--help") {
    if (ctx.json) {
      console.log(JSON.stringify({ ok: true, data: { commands: COMMANDS } }));
    } else {
      showHelp();
    }
    return;
  }

  const data = await runCommand(command, rest, ctx);
  if (ctx.json) {
    console.log(JSON.stringify({ ok: true, data }));
  }
}

main().catch((err) => {
  if (err instanceof CliCommandError) {
    const payload = {
      ok: false,
      error: {
        code: err.code,
        message: err.message,
        details: err.details,
      },
    };

    if (process.argv.includes("--json")) {
      console.log(JSON.stringify(payload));
    } else {
      console.error(`  ${c.error("Error:")} ${err.message}`);
    }

    process.exitCode = 1;
    return;
  }

  const msg = err instanceof Error ? err.message : String(err);
  const payload = {
    ok: false,
    error: {
      code: "FATAL",
      message: msg,
    },
  };

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(payload));
  } else {
    console.error(`  ${c.error("Fatal:")} ${msg}`);
  }
  process.exitCode = 1;
});
