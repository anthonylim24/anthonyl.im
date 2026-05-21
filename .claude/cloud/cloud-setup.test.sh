#!/usr/bin/env bash
# Invariants for the Claude Code cloud setup kit.
# Mirrors .codex/cloud-setup.test.sh — keeps the two cloud kits aligned.

set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

assert_contains() {
  local file="$1"
  local needle="$2"
  if ! grep -qF -- "$needle" "$ROOT_DIR/$file"; then
    echo "[claude-cloud-test] expected $file to contain: $needle" >&2
    exit 1
  fi
}

assert_executable() {
  local file="$1"
  if [ ! -x "$ROOT_DIR/$file" ]; then
    echo "[claude-cloud-test] expected $file to be executable" >&2
    exit 1
  fi
}

# Lint shell.
bash -n \
  "$ROOT_DIR/.claude/cloud/setup.sh" \
  "$ROOT_DIR/.claude/cloud/verify.sh" \
  "$ROOT_DIR/.claude/cloud/dev.sh" \
  "$ROOT_DIR/.claude/cloud/e2e.sh"

assert_executable ".claude/cloud/setup.sh"
assert_executable ".claude/cloud/verify.sh"
assert_executable ".claude/cloud/dev.sh"
assert_executable ".claude/cloud/e2e.sh"

# Don't fork the Codex bootstrap — these scripts must reuse it.
assert_contains ".claude/cloud/setup.sh" ".codex/setup.sh"
assert_contains ".claude/cloud/verify.sh" ".codex/check.sh"
assert_contains ".claude/cloud/e2e.sh" ".codex/lib.sh"
assert_contains ".claude/cloud/dev.sh" ".codex/dev.sh"

# E2E plumbing is wired up.
[ -f "$ROOT_DIR/frontend/playwright.config.ts" ] || {
  echo "[claude-cloud-test] missing frontend/playwright.config.ts" >&2
  exit 1
}
[ -d "$ROOT_DIR/frontend/e2e" ] || {
  echo "[claude-cloud-test] missing frontend/e2e directory" >&2
  exit 1
}

echo "[claude-cloud-test] setup script invariants passed"
