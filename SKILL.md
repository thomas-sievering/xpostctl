---
name: xpostctl
version: "1.0"
description: Use this skill when user asks to draft, generate, post, list, fetch, or delete tweets/X posts from terminal.
user-invocable: true
argument-hint: "[draft|generate|post|list|get|delete] [options]"
allowed-tools: Read, Bash
---

# xpostctl Skill

Agent workflow for using `xpostctl` to manage X/Twitter content.

## Arguments

Parse `$ARGUMENTS` into:
- `mode`: `draft`, `generate`, `post`, `list`, `get`, or `delete`
- `target`: text/topic/id depending on command
- `extra`: remaining flags

If mode is missing, infer from user request:
- "create draft", "write tweet" -> `draft`
- "generate tweet", "ideas", "thread" -> `generate`
- "post this", "publish" -> `post`
- "show drafts", "list posted" -> `list`
- "show tweet <id>" -> `get`
- "remove tweet" -> `delete`

## Examples

- User says: "draft this tweet: shipping beats polish"
  - Run: `xpostctl draft "shipping beats polish"`
- User says: "generate thread about bun vs node"
  - Run: `xpostctl generate thread "bun vs node"`
- User says: "post a1b2c3 dry run"
  - Run: `xpostctl post a1b2c3 --dry`
- User says: "list my drafts"
  - Run: `xpostctl list drafts --json`

## Steps

### 1) Create or generate draft(s)

```powershell
xpostctl draft "My first tweet"
xpostctl generate "bun runtime"
xpostctl generate thread "why fast feedback loops win"
```

### 2) Review

```powershell
xpostctl list drafts --json
xpostctl get <id> --json
```

### 3) Post

```powershell
xpostctl post <id> --dry
xpostctl post <id>
```

### 4) Delete

```powershell
xpostctl delete <id> --dry
xpostctl delete <id>
```

## Error Handling

- If command returns `NOT_FOUND`, confirm id with `xpostctl list --json`.
- If command returns `INVALID_ARGS`, retry with required positional args.
- If posting fails, do not retry blindly; show exact API error first.
- For high-impact actions (`post`, non-dry `delete`), echo target id before execution.
