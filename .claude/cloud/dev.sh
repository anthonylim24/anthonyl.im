#!/usr/bin/env bash
# Boot both servers (Hono :3000 + Vite :5173) for in-cloud iteration.
#
# Thin wrapper — the real implementation lives in .codex/dev.sh so the
# two cloud environments orchestrate processes the same way. If you need
# to tweak server startup, change .codex/dev.sh, not this file.

set -Eeuo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
exec "$ROOT_DIR/.codex/dev.sh" "$@"
