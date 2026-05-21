#!/usr/bin/env bash
# The Claude Code cloud verification gate.
#
# Delegates to .codex/check.sh — same gate the GitHub Actions deploy job
# enforces (server tests + frontend typecheck). Adding stricter checks
# here (lint, frontend unit tests) was considered and rejected: those
# have pre-existing failures on main that would block unrelated work.
# Run `bun run lint` / `bun run test:run` in frontend/ when fixing that
# debt — not as a precondition for every Claude Code task.
#
# E2E lives separately in .claude/cloud/e2e.sh because it needs a
# browser and a live server.

set -Eeuo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
exec "$ROOT_DIR/.codex/check.sh" "$@"
