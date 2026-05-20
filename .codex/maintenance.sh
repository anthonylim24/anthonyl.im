#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUN_INSTALL="${BUN_INSTALL:-$HOME/.bun}"
export BUN_INSTALL
export PATH="$BUN_INSTALL/bin:$PATH"

if [ -f "$ROOT_DIR/.nvmrc" ] && [ -s "$HOME/.nvm/nvm.sh" ]; then
  # shellcheck disable=SC1091
  source "$HOME/.nvm/nvm.sh"
  node_version="$(tr -d '[:space:]' < "$ROOT_DIR/.nvmrc")"
  nvm install "$node_version" >/dev/null
  nvm use "$node_version" >/dev/null
fi

if ! command -v bun >/dev/null 2>&1; then
  echo "[codex-maintenance] Bun is missing; running full setup"
  exec "$ROOT_DIR/.codex/setup.sh"
fi

if [ ! -f "$ROOT_DIR/.env" ]; then
  cp "$ROOT_DIR/.codex/root.env.example" "$ROOT_DIR/.env"
fi

if [ ! -f "$ROOT_DIR/frontend/.env.local" ]; then
  cp "$ROOT_DIR/.codex/frontend.env.local.example" "$ROOT_DIR/frontend/.env.local"
fi

cd "$ROOT_DIR"
echo "[codex-maintenance] refreshing root dependencies"
bun install --frozen-lockfile

cd "$ROOT_DIR/frontend"
echo "[codex-maintenance] refreshing frontend dependencies"
bun install --frozen-lockfile

echo "[codex-maintenance] ready"
