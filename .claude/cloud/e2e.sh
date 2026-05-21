#!/usr/bin/env bash
# Run Playwright E2E against a live full stack.
#
# Playwright's `webServer` config owns the lifecycle of both the Hono
# backend and the Vite frontend — see frontend/playwright.config.ts.
# That keeps the run hermetic: no orphaned dev servers, no port leaks,
# and Playwright knows to wait until the URLs are healthy before
# starting the suite.
#
# Args are forwarded to `playwright test`, so:
#   bash .claude/cloud/e2e.sh                  # full suite
#   bash .claude/cloud/e2e.sh --ui             # local debug UI
#   bash .claude/cloud/e2e.sh smoke.spec.ts    # one file

set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BUN_INSTALL="${BUN_INSTALL:-$HOME/.bun}"
export BUN_INSTALL
export PATH="$BUN_INSTALL/bin:$PATH"

# shellcheck source=../../.codex/lib.sh
source "$ROOT_DIR/.codex/lib.sh"

# Stubs match .codex/dev.sh so the spawned backend doesn't trip on missing env.
export KLUSTER_API_KEY="${KLUSTER_API_KEY:-codex-stub}"
export KLUSTER_API_BASE_URL="${KLUSTER_API_BASE_URL:-https://example.invalid}"
export IG_WORKER_ENABLED="${IG_WORKER_ENABLED:-false}"
export IG_DEV_BEARER="${IG_DEV_BEARER:-codex-dev-bearer}"
export IG_DEV_USER_ID="${IG_DEV_USER_ID:-codex-dev}"
export PORT="${PORT:-3000}"
export CORS_ORIGIN="${CORS_ORIGIN:-http://localhost:5173}"
export SITE_URL="${SITE_URL:-http://localhost:${PORT}}"

if ! command -v bun >/dev/null 2>&1; then
  echo "[claude-e2e] ERROR: bun is not on PATH. Run .claude/cloud/setup.sh first." >&2
  exit 1
fi

ensure_dependencies

cd "$ROOT_DIR/frontend"

if ! bunx playwright --version >/dev/null 2>&1; then
  echo "[claude-e2e] ERROR: Playwright is not installed. Run .claude/cloud/setup.sh first." >&2
  exit 1
fi

# `bunx playwright install --dry-run` exits 0 only when browsers are present.
if ! bunx playwright install chromium --dry-run >/dev/null 2>&1; then
  echo "[claude-e2e] Chromium not downloaded — running install"
  bunx playwright install chromium
fi

echo "[claude-e2e] running Playwright suite"
bunx playwright test "$@"
