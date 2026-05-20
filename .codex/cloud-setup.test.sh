#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PUBLIC_REGISTRY="https://registry.npmjs.org/"

assert_contains() {
  local file="$1"
  local needle="$2"

  if ! grep -qF -- "$needle" "$ROOT_DIR/$file"; then
    echo "[codex-cloud-test] expected $file to contain: $needle" >&2
    exit 1
  fi
}

assert_executable() {
  local file="$1"

  if [ ! -x "$ROOT_DIR/$file" ]; then
    echo "[codex-cloud-test] expected $file to be executable" >&2
    exit 1
  fi
}

bash -n \
  "$ROOT_DIR/.codex/setup.sh" \
  "$ROOT_DIR/.codex/maintenance.sh" \
  "$ROOT_DIR/.codex/dev.sh" \
  "$ROOT_DIR/.codex/check.sh"

assert_executable ".codex/setup.sh"
assert_executable ".codex/maintenance.sh"
assert_executable ".codex/dev.sh"
assert_executable ".codex/check.sh"

assert_contains ".codex/lib.sh" "$PUBLIC_REGISTRY"
assert_contains ".codex/lib.sh" "verify_dependency_roots"
assert_contains ".codex/setup.sh" "install_dependency_roots"
assert_contains ".codex/maintenance.sh" "install_dependency_roots"
assert_contains ".codex/dev.sh" "ensure_dependencies"
assert_contains ".codex/check.sh" "ensure_dependencies"

echo "[codex-cloud-test] setup script invariants passed"
