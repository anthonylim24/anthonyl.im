#!/usr/bin/env bash
# The Claude Code cloud verification gate.
#
# Delegates to .codex/check.sh — the local/cloud verify gate (server
# typecheck + server tests + frontend typecheck + TS pre-flight). GitHub
# `pr-gate` is stricter: it also runs frontend lint, build, vitest, and the
# cloud-setup smoke job. See docs/ci-cd.md.
#
# E2E lives separately in .claude/cloud/e2e.sh because it needs a
# browser and a live server.

set -Eeuo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
exec "$ROOT_DIR/.codex/check.sh" "$@"
