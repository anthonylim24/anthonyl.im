#!/usr/bin/env bash
# Same preview Vite build as .github/workflows/preview.yml.
# Never run this on the 1 GB droplet.
set -euo pipefail
# shellcheck source=lib.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"
cd "$CI_ROOT/frontend"
require_cmd bun

PR_NUMBER="${PR_NUMBER:-}"
[[ "$PR_NUMBER" =~ ^[0-9]{1,10}$ ]] || ci_die "PR_NUMBER must be a numeric PR id"
if [[ -z "${FRONTEND_ENV:-}" ]]; then
  ci_die "FRONTEND_ENV is missing — cannot bake Clerk/Supabase keys into the preview."
fi

export VITE_BASE="${VITE_BASE:-/preview/pr/${PR_NUMBER}/}"
export VITE_API_BASE="${VITE_API_BASE:-/preview/pr/${PR_NUMBER}}"

umask 077
# Never bake the local-dev Clerk bypass into a public preview.
printf '%s\n' "$FRONTEND_ENV" | sed '/^[[:space:]]*VITE_DEV_BEARER=/d' > .env
printf '\nVITE_ENABLE_SERVICE_WORKER=false\n' >> .env
printf 'VITE_API_BASE=/preview/pr/%s\n' "$PR_NUMBER" >> .env
if grep -E '^[[:space:]]*VITE_DEV_BEARER=' .env >/dev/null; then
  ci_die "VITE_DEV_BEARER leaked into the preview .env"
fi

ci_log "vite preview build PR=$PR_NUMBER base=$VITE_BASE"
bun run build

grep -F "/preview/pr/${PR_NUMBER}/assets/" dist/index.html \
  || ci_die "built index.html is missing the preview asset base"
