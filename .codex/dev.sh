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
    echo "[codex-dev] ERROR: Node $node_version is not installed. Run .codex/setup.sh first." >&2
    exit 1
  fi
fi

export KLUSTER_API_KEY="${KLUSTER_API_KEY:-codex-stub}"
export KLUSTER_API_BASE_URL="${KLUSTER_API_BASE_URL:-https://example.invalid}"
export IG_WORKER_ENABLED="${IG_WORKER_ENABLED:-false}"
export IG_DEV_BEARER="${IG_DEV_BEARER:-codex-dev-bearer}"
export IG_DEV_USER_ID="${IG_DEV_USER_ID:-codex-dev}"
export PORT="${PORT:-3000}"
export CORS_ORIGIN="${CORS_ORIGIN:-http://localhost:5173}"
export SITE_URL="${SITE_URL:-http://localhost:${PORT}}"

if ! command -v bun >/dev/null 2>&1; then
  echo "[codex-dev] ERROR: bun is not on PATH. Run .codex/setup.sh first." >&2
  exit 1
fi

if [ ! -f "$ROOT_DIR/.env" ]; then
  cp "$ROOT_DIR/.codex/root.env.example" "$ROOT_DIR/.env"
fi

if [ ! -f "$ROOT_DIR/frontend/.env.local" ]; then
  cp "$ROOT_DIR/.codex/frontend.env.local.example" "$ROOT_DIR/frontend/.env.local"
fi

ensure_dependencies

pids=()

cleanup() {
  local exit_code=$?
  trap - EXIT INT TERM
  for pid in "${pids[@]}"; do
    if kill -0 "$pid" >/dev/null 2>&1; then
      kill "$pid" >/dev/null 2>&1 || true
    fi
  done
  exit "$exit_code"
}

trap cleanup EXIT INT TERM

echo "[codex-dev] starting root server at http://localhost:${PORT}"
(
  cd "$ROOT_DIR"
  bun dev
) &
pids+=("$!")

echo "[codex-dev] starting frontend Vite server at http://localhost:5173"
(
  cd "$ROOT_DIR/frontend"
  bun run dev -- --host 0.0.0.0
) &
pids+=("$!")

while true; do
  for pid in "${pids[@]}"; do
    if ! kill -0 "$pid" >/dev/null 2>&1; then
      wait "$pid"
      exit "$?"
    fi
  done
  sleep 1
done
