#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUN_INSTALL="${BUN_INSTALL:-$HOME/.bun}"
export BUN_INSTALL
export PATH="$BUN_INSTALL/bin:$PATH"

# shellcheck source=.codex/lib.sh
source "$ROOT_DIR/.codex/lib.sh"

if [ -f "$ROOT_DIR/.nvmrc" ] && [ -s "$HOME/.nvm/nvm.sh" ]; then
  # shellcheck disable=SC1091
  source "$HOME/.nvm/nvm.sh"
  node_version="$(tr -d '[:space:]' < "$ROOT_DIR/.nvmrc")"
  if ! nvm use "$node_version" >/dev/null; then
    echo "[codex-check] ERROR: Node $node_version is not installed. Run .codex/setup.sh first." >&2
    exit 1
  fi
fi

export KLUSTER_API_KEY="${KLUSTER_API_KEY:-codex-stub}"
export KLUSTER_API_BASE_URL="${KLUSTER_API_BASE_URL:-https://example.invalid}"
export IG_WORKER_ENABLED="${IG_WORKER_ENABLED:-false}"

if ! command -v bun >/dev/null 2>&1; then
  echo "[codex-check] ERROR: bun is not on PATH. Run .codex/setup.sh first." >&2
  exit 1
fi

ensure_dependencies

cd "$ROOT_DIR"
echo "[codex-check] running server tests"
bun test --bail server/src

cd "$ROOT_DIR/frontend"
echo "[codex-check] running frontend typecheck"
bun run typecheck

echo "[codex-check] checks passed"
