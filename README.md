# xpostctl - X Posting Toolkit (Go)

Go CLI toolkit for drafting, generating, posting, listing, fetching, and deleting X/Twitter content.

## Commands

```bash
xpostctl draft <text>
xpostctl draft --edit <id> <text>
xpostctl draft --delete <id>

xpostctl generate <topic>
xpostctl generate thread <topic>
xpostctl generate ideas

xpostctl post <id> [--dry]
xpostctl list [drafts|posted|failed]
xpostctl get <id>
xpostctl delete <id> [--dry]
```

Global flag:

- `--json` for machine-readable output envelope.

## JSON Output

- Success: `{"ok":true,"data":...}`
- Error: `{"ok":false,"error":{"code":"...","message":"...","details":...}}`

## Configuration

Data directory: `.twitter/`

- `config.json` - Twitter + AI defaults
- `tweets.json` - local tweet store
- `generations.json` - generation history

Credential sources (highest priority first):

1. env vars (`X_API_KEY`, `X_API_SECRET`, `X_ACCESS_TOKEN`, `X_ACCESS_SECRET`)
2. `XPOSTCTL_ENV_FILE`
3. local `x.env`

## Build

```bash
go test ./...
go build -o xpostctl.exe .
```
