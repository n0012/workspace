#!/usr/bin/env bash
#
# setup-mcp.sh — configure THIS checkout of n0012/workspace as the Google
# Workspace MCP server for Claude Code and/or the gemini/jetski extension.
#
# Idempotent and self-locating: every path is derived from where this repo is
# checked out, so it works no matter where you cloned it (laptop, new Mac,
# Cloudtop). Safe to re-run. Works with or without `claude` on PATH.
#
# New-machine setup:
#   git clone git@github.com:n0012/workspace.git ~/dev/github/n0012/workspace
#   cd ~/dev/github/n0012/workspace
#   ./scripts/setup-mcp.sh
#   npm run auth-utils -- login        # one-time browser auth (see docs)
#   # restart Claude Code / jetski
#
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVER="$REPO/workspace-server/dist/index.js"
EXT="$HOME/.gemini/extensions/google-workspace"

log() { printf '  %s\n' "$*"; }

# ── 1. Build the server if needed ────────────────────────────────────────────
if [ ! -f "$SERVER" ]; then
  log "Building workspace-server (dist/index.js missing)…"
  ( cd "$REPO" && npm install && npm run build )
else
  log "dist/index.js present — skipping build (run 'npm run build' to refresh after a pull)"
fi

# ── 2. Thin gemini/jetski extension → this checkout's prebuilt server ─────────
# Deliberately bypasses scripts/start.js (it runs `npm install` on every launch).
log "Writing gemini/jetski extension → $EXT"
mkdir -p "$EXT"
cat > "$EXT/gemini-extension.json" <<JSON
{
  "name": "google-workspace",
  "version": "0.0.8",
  "contextFileName": "WORKSPACE-Context.md",
  "mcpServers": {
    "google-workspace": {
      "command": "node",
      "args": [
        "$SERVER",
        "--use-dot-names"
      ],
      "cwd": "$REPO"
    }
  }
}
JSON
ln -sfn "$REPO/workspace-server/WORKSPACE-Context.md" "$EXT/WORKSPACE-Context.md"
ln -sfn "$REPO/commands" "$EXT/commands"

# ── 3. Claude Code MCP registration (only if claude is installed) ─────────────
if command -v claude >/dev/null 2>&1; then
  if claude mcp list 2>/dev/null | grep -q "gemini-workspace.*$SERVER"; then
    log "Claude MCP already registered → $SERVER"
  else
    log "Registering Claude MCP 'gemini-workspace' → $SERVER"
    claude mcp remove gemini-workspace --scope user >/dev/null 2>&1 || true
    claude mcp add --scope user gemini-workspace node "$SERVER" "--use-dot-names" >/dev/null 2>&1 \
      && log "registered" || log "registration failed — register manually (see docs)"
  fi
else
  log "claude not on PATH — skipping Claude registration (jetski/gemini only)"
fi

echo
echo "  Workspace MCP configured for: $REPO"
echo "  One-time auth (browser):  cd $REPO && npm run auth-utils -- login"
echo "  Headless (SSH/Cloudtop):  see docs/claude-code-mcp-setup.md"
echo "  Restart Claude Code / jetski to pick up the change."
