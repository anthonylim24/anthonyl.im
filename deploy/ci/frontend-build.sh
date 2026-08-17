#!/usr/bin/env bash
# Production or stub frontend build. Never run this on the 1 GB droplet.
#
#   MODE=stub       PR check — copy .env.example if .env is missing
#   MODE=production write FRONTEND_ENV (required) to frontend/.env
set -euo pipefail
# shellcheck source=lib.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"
cd "$CI_ROOT/frontend"
require_cmd bun

MODE="${MODE:-stub}"
umask 077

if [[ "$MODE" == "production" || "$MODE" == "preview" ]]; then
  if [[ -z "${FRONTEND_ENV:-}" ]]; then
    ci_die "FRONTEND_ENV is missing — cannot bake Clerk/Supabase keys into the bundle."
  fi
  # Never bake the local-dev Clerk bypass into a public or production bundle.
  printf '%s\n' "$FRONTEND_ENV" | sed '/^[[:space:]]*VITE_DEV_BEARER=/d' > .env
  if grep -E '^[[:space:]]*VITE_DEV_BEARER=' .env >/dev/null; then
    ci_die "VITE_DEV_BEARER leaked into the frontend .env"
  fi
else
  if [[ ! -f .env ]]; then
    if [[ -f .env.local.example ]]; then
      cp .env.local.example .env
    elif [[ -f .env.example ]]; then
      cp .env.example .env
    fi
  fi
fi

ci_log "vite build (MODE=$MODE)"
bun run build
