#!/usr/bin/env bash
# Bootstrap a fresh Claude Code cloud container for this repo.
#
# What this does (and what it intentionally doesn't):
#   - Delegates Bun + Node + dep install + env seeding to .codex/setup.sh
#     so the two cloud environments stay in sync. Do not duplicate that
#     logic here.
#   - Adds the one thing Codex doesn't need: a Playwright browser install,
#     so end-to-end tests can run via .claude/cloud/e2e.sh.
#
# Idempotent — safe to re-run.

set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BUN_INSTALL="${BUN_INSTALL:-$HOME/.bun}"
export BUN_INSTALL
export PATH="$BUN_INSTALL/bin:$PATH"

echo "[claude-setup] delegating to .codex/setup.sh (Bun, Node, deps, env stubs)"
bash "$ROOT_DIR/.codex/setup.sh"

echo "[claude-setup] installing Playwright Chromium for E2E"
cd "$ROOT_DIR/frontend"

# --with-deps installs system libs Chromium needs (libnss3, libatk, …) and
# requires root. Use it when we're running as root on Linux (Claude Code
# cloud's default); fall back to the user-mode install everywhere else.
if [ "$(uname -s)" = "Linux" ] && [ "$(id -u)" = "0" ]; then
  bunx playwright install --with-deps chromium
else
  bunx playwright install chromium
fi

echo "[claude-setup] ready"
echo "[claude-setup]   verify:  bash .claude/cloud/verify.sh"
echo "[claude-setup]   dev:     bash .claude/cloud/dev.sh"
echo "[claude-setup]   e2e:     bash .claude/cloud/e2e.sh"
