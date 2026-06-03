# Using this Workspace server as an MCP (Claude Code + jetski/gemini)

This repo (`n0012/workspace`) is the canonical source for the Google Workspace MCP
server — Gmail, Calendar, Drive, Docs, Slides (incl. the `slides.createFromJson` /
write tools this fork adds), Sheets, Chat. It's run as an **MCP server**, not a skill.

The same built server (`workspace-server/dist/index.js`) is shared by both clients:
- **Claude Code** — registered as the `gemini-workspace` MCP.
- **jetski / Gemini CLI** — loaded as a thin extension at `~/.gemini/extensions/google-workspace`.

## Quick start (new machine)

```bash
git clone git@github.com:n0012/workspace.git ~/dev/github/n0012/workspace
cd ~/dev/github/n0012/workspace
./scripts/setup-mcp.sh          # builds dist, wires both clients to THIS checkout
npm run auth-utils -- login     # one-time browser auth (headless variant below)
# restart Claude Code / jetski
```

That's it. `scripts/setup-mcp.sh` is idempotent and self-locating — re-run it any time
(after a fresh clone, or to repoint a client). It is also invoked automatically by the
`git-bootstrap` skill's workspace step, so a full `git-bootstrap` run sets this up too.

## What `setup-mcp.sh` does

All paths are derived from where you cloned the repo, so it works anywhere:

1. **Builds** `workspace-server/dist/index.js` if missing (`npm install && npm run build`).
2. **Writes the thin jetski/gemini extension** at `~/.gemini/extensions/google-workspace/`:
   a generated `gemini-extension.json` whose mcpServer runs
   `node <repo>/workspace-server/dist/index.js --use-dot-names` (cwd = repo root), plus
   symlinks `WORKSPACE-Context.md` and `commands/` back to the repo.
   > This deliberately **bypasses `scripts/start.js`**, which runs `npm install` on every
   > launch. The thin extension launches the prebuilt server directly — fast, and it tracks
   > the repo (a `git pull` + rebuild updates both clients).
3. **Registers the Claude Code MCP** (`gemini-workspace` → the same `dist/index.js`) — but
   only if `claude` is on `PATH`. On a no-Claude box (e.g. a Cloudtop) it skips this and just
   configures the jetski/gemini extension. Same script, both environments.

## Credentials

Auth uses OAuth; tokens are stored in the **OS keychain** (user-level, not tied to a working
directory), so the server authenticates from any cwd and both clients share one login.

- **Standard (has a browser):** `cd ~/dev/github/n0012/workspace && npm run auth-utils -- login`
- **Headless / SSH / Docker (no TTY):** `headless-login.js` reads `/dev/tty`, which doesn't
  exist over SSH. Route it through stdin with `patch-tty.js`:
  ```bash
  cd ~/dev/github/n0012/workspace/workspace-server
  # 1. print the auth URL
  GEMINI_CLI_WORKSPACE_FORCE_FILE_STORAGE=true node --require ./patch-tty.js dist/headless-login.js --force
  # 2. open the URL on a machine with a browser, sign in, copy the credentials JSON it shows
  # 3. pipe it back:
  echo '{"access_token":"...","refresh_token":"...","expiry_date":...}' | \
    GEMINI_CLI_WORKSPACE_FORCE_FILE_STORAGE=true \
    node --require ./patch-tty.js dist/headless-login.js --force
  ```
  Then restart the client so the MCP process picks up the new credentials.

> **Never commit the credential files** (`gemini-cli-workspace-token.json`,
> `.gemini-cli-workspace-master-key`). They were once checked into a different repo by
> accident — keep them out of git.

## Updating after a pull

The clients reference the **built** file by absolute path, so rebuild after pulling source:

```bash
cd ~/dev/github/n0012/workspace && git pull && (cd workspace-server && npm run build)
# restart Claude Code / jetski
```

(`git-bootstrap` runs the build for you; or just re-run `./scripts/setup-mcp.sh`, which builds
only if `dist/` is missing — pass through `npm run build` yourself when source changed.)

## Source & fork

Tracks **[github.com/n0012/workspace](https://github.com/n0012/workspace)**, which extends
upstream `gemini-cli-extensions/workspace` with Slides write tools. Upstream PRs:
[#348](https://github.com/gemini-cli-extensions/workspace/pull/348) (createFromJson),
[#237](https://github.com/gemini-cli-extensions/workspace/pull/237) (write tools).

## Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| Tools missing in Claude | `dist/index.js` not built — `cd workspace-server && npm run build`, restart |
| Tools missing in jetski | extension not written or jetski not restarted — re-run `./scripts/setup-mcp.sh`, restart jetski |
| API calls fail "No browser available" | token expired — re-auth (above) |
| Claude registration not in `settings.json` | it's stored under user scope / `.claude.json`, not `settings.json` |
| Verify Claude side | `claude mcp list` → `gemini-workspace` should be **✓ Connected** |
| Verify jetski side | `cat ~/.gemini/extensions/google-workspace/gemini-extension.json` points at your checkout's `dist/index.js` |
