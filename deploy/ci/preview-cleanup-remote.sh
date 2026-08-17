#!/usr/bin/env bash
# Runs ON the droplet when a PR closes.
# Same steps as .github/workflows/preview.yml cleanup job.
set -euo pipefail
PR="${PR_NUMBER:-}"
[[ "$PR" =~ ^[0-9]{1,10}$ ]] || { echo "PR_NUMBER must be numeric" >&2; exit 1; }

if [ -f "$HOME/previews/$PR/api.pid" ]; then
  kill "$(cat "$HOME/previews/$PR/api.pid")" 2>/dev/null || true
fi
rm -rf "$HOME/previews/$PR" "$HOME/previews/.staging/$PR" "$HOME/previews/.incoming/$PR"
echo "[preview] removed PR $PR"
