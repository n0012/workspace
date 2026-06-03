# Using this Workspace server as an MCP for Claude Code

> Moved here from `n0012/losiern-monorepo/ai-skills/gemini-workspace-mcp/` when that
> folder was retired. This repo (`n0012/workspace`) is the canonical source; the MCP
> server Claude Code runs is built from `workspace-server/` here.

This server gives Claude Code (and Gemini CLI) tools for Gmail, Calendar, Drive, Docs,
Slides, Sheets, and Chat. It is registered as an **MCP server**, not a skill.

## How it works

`workspace-server/` is a Node.js process. Claude Code spawns it as a subprocess and talks
to it over stdio. It must be **built** before Claude can start it — if `dist/index.js` is
missing or stale, the MCP silently fails to load.

```bash
cd ~/dev/github/n0012/workspace/workspace-server
npm install     # once, or after dependency changes
npm run build   # compiles src/ → dist/index.js via esbuild
```

## Registration (the gotcha)

Claude Code has two config files:
- `settings.json` — user preferences (model, permissions, MCP servers you add via `/mcp`)
- `.claude.json` — internal state **and** global MCP servers

This MCP is typically registered via `claude mcp add` (which writes user scope), pointing at
the built entrypoint:

```bash
claude mcp add gemini-workspace -- node \
  ~/dev/github/n0012/workspace/workspace-server/dist/index.js --use-dot-names
```

Verify with `claude mcp list` — `gemini-workspace` should show **✓ Connected**. If you
registered it manually and can't find it in `settings.json`, check `.claude.json` under the
top-level `mcpServers` key (or per-project `mcpServers`).

## Source & fork

Tracks the fork **[github.com/n0012/workspace](https://github.com/n0012/workspace)**, which
extends upstream `gemini-cli-extensions/workspace` with Slides write tools (`slides.create`,
`slides.batchUpdate`, `slides.createFromJson`). Upstream PRs:
[#348](https://github.com/gemini-cli-extensions/workspace/pull/348) (createFromJson),
[#237](https://github.com/gemini-cli-extensions/workspace/pull/237) (write tools).

## Installing on a new machine

**Claude Code**
```bash
git clone git@github.com:n0012/workspace.git ~/dev/github/n0012/workspace
cd ~/dev/github/n0012/workspace/workspace-server && npm install && npm run build
npm run auth-utils -- login            # standard machine (has browser)
node dist/headless-login.js            # headless / SSH alternative
claude mcp add gemini-workspace -- node \
  ~/dev/github/n0012/workspace/workspace-server/dist/index.js --use-dot-names
```

**Gemini CLI**
```bash
gemini extensions install https://github.com/n0012/workspace
node ~/.gemini/extensions/google-workspace/workspace-server/dist/headless-login.js
gemini extensions list      # should show: google-workspace
gemini extensions update google-workspace
```

## Re-authenticating

Standard:
```bash
cd ~/dev/github/n0012/workspace && npm run auth-utils -- login
```

**Docker / no TTY** — `headless-login.js` reads `/dev/tty`, which doesn't exist in a
container. Route it through stdin with `patch-tty.js`:

1. Get the auth URL:
   ```bash
   cd ~/dev/github/n0012/workspace/workspace-server
   GEMINI_CLI_WORKSPACE_FORCE_FILE_STORAGE=true node --require ./patch-tty.js dist/headless-login.js --force
   ```
2. Open the URL, sign in — the browser shows a credentials JSON blob.
3. Pipe it back:
   ```bash
   echo '{"access_token":"...","refresh_token":"...","expiry_date":...}' | \
     GEMINI_CLI_WORKSPACE_FORCE_FILE_STORAGE=true \
     node --require ./patch-tty.js dist/headless-login.js --force
   ```
4. Restart the Claude Code session so the MCP process picks up the new credentials.

> **Never commit the credential files** (`gemini-cli-workspace-token.json`,
> `.gemini-cli-workspace-master-key`). They were accidentally checked into the old monorepo
> folder; that's why this server moved homes and the creds were rotated.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| Workspace tools not available in Claude | `dist/index.js` missing — run `npm run build` |
| MCP loads but API calls fail with "No browser available" | OAuth token expired — re-auth (above) |
| Don't see it in `settings.json` | It's in `.claude.json`, not `settings.json` |
| Want to verify it's loaded | `claude mcp list` — `gemini-workspace` should be Connected |
