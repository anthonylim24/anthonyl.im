#!/usr/bin/env bash
set -Eeuo pipefail
# FALSIFY: intentional syntax error to validate pr-cloud-setup
if [ "broken"


ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUN_INSTALL="${BUN_INSTALL:-$HOME/.bun}"
BUN_BIN="$BUN_INSTALL/bin/bun"
BASHRC="$HOME/.bashrc"

# shellcheck source=.codex/lib.sh
source "$ROOT_DIR/.codex/lib.sh"

append_once() {
  local line="$1"
  local file="$2"

  touch "$file"
  if ! grep -qxF "$line" "$file"; then
    printf '\n%s\n' "$line" >> "$file"
  fi
}

use_node_from_nvmrc() {
  if [ ! -f "$ROOT_DIR/.nvmrc" ]; then
    return 0
  fi

  local node_version
  node_version="$(tr -d '[:space:]' < "$ROOT_DIR/.nvmrc")"

  if [ -s "$HOME/.nvm/nvm.sh" ]; then
    append_once 'export NVM_DIR="$HOME/.nvm"' "$BASHRC"
    append_once '[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"' "$BASHRC"
    append_once 'if [ -f .nvmrc ] && command -v nvm >/dev/null 2>&1; then nvm use --silent >/dev/null 2>&1 || true; fi' "$BASHRC"

    # shellcheck disable=SC1091
    source "$HOME/.nvm/nvm.sh"
    nvm install "$node_version"
    nvm use "$node_version"
  else
    echo "[codex-setup] nvm not found; use Codex environment settings to pin Node ${node_version}."
  fi
}

install_bun_if_needed() {
  export BUN_INSTALL
  export PATH="$BUN_INSTALL/bin:$PATH"

  append_once 'export BUN_INSTALL="${BUN_INSTALL:-$HOME/.bun}"' "$BASHRC"
  append_once 'export PATH="$BUN_INSTALL/bin:$PATH"' "$BASHRC"

  if command -v bun >/dev/null 2>&1; then
    echo "[codex-setup] bun $(bun --version) already available at $(command -v bun)"
    return 0
  fi

  echo "[codex-setup] installing Bun"
  curl -fsSL https://bun.sh/install | bash
  export PATH="$BUN_INSTALL/bin:$PATH"

  if [ ! -x "$BUN_BIN" ]; then
    echo "[codex-setup] ERROR: Bun install did not create $BUN_BIN" >&2
    exit 1
  fi

  echo "[codex-setup] bun $("$BUN_BIN" --version) installed"
}

seed_env_files() {
  if [ ! -f "$ROOT_DIR/.env" ]; then
    cp "$ROOT_DIR/.codex/root.env.example" "$ROOT_DIR/.env"
    echo "[codex-setup] wrote $ROOT_DIR/.env (safe stub defaults)"
  else
    echo "[codex-setup] $ROOT_DIR/.env already exists; left untouched"
  fi

  if [ ! -f "$ROOT_DIR/frontend/.env.local" ]; then
    cp "$ROOT_DIR/.codex/frontend.env.local.example" "$ROOT_DIR/frontend/.env.local"
    echo "[codex-setup] wrote $ROOT_DIR/frontend/.env.local (safe stub defaults)"
  else
    echo "[codex-setup] $ROOT_DIR/frontend/.env.local already exists; left untouched"
  fi
}

install_dependencies() {
  # Always run install_dependency_roots — `bun install --frozen-lockfile`
  # is a fast no-op when the tree already matches the lockfile, so this
  # stays cheap on repeat runs while still repairing partial installs.
  install_dependency_roots
}

print_summary() {
  echo "[codex-setup] -------- summary --------"
  echo "[codex-setup] repo root: $ROOT_DIR"
  echo "[codex-setup] bun: $(command -v bun) ($(bun --version))"
  if command -v node >/dev/null 2>&1; then
    echo "[codex-setup] node: $(command -v node) ($(node --version))"
  fi
  if ts_version="$(cd "$ROOT_DIR/frontend" && bunx --bun tsc --version 2>/dev/null)"; then
    echo "[codex-setup] frontend ${ts_version}"
  fi
  echo "[codex-setup] env stubs: .env, frontend/.env.local"
  echo "[codex-setup] next steps:"
  echo "[codex-setup]   verify:  bash .codex/check.sh"
  echo "[codex-setup]   dev:     bash .codex/dev.sh"
  echo "[codex-setup] ------------------------"
}

echo "[codex-setup] preparing $ROOT_DIR"
use_node_from_nvmrc
node --version || true
install_bun_if_needed
seed_env_files
install_dependencies
print_summary
echo "[codex-setup] ready"
