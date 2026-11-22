#!/usr/bin/env bash
# Writes frontend/.env for a CI build. deploy.yml (production) and
# preview.yml (PR previews) both call it, so a preview bakes the same Clerk
# and Supabase values as production. It has to: the preview API sidecar
# verifies tokens with the droplet's production CLERK_SECRET_KEY, so a
# bundle on any other Clerk instance cannot sign in there.
#
#   write-frontend-env.sh <out-file> [--preview <pr-number>]
#
# Inputs are environment variables, never script text, so a `$` or quote in
# a value stays literal. The names carry no VITE_ prefix on purpose: Vite
# gives process env priority over .env, so an empty VITE_* in the step's env
# would blank the value written here.
#
#   FRONTEND_ENV              required; the body of frontend/.env
#   IN_CLERK_PUBLISHABLE_KEY  required; replaces any key in FRONTEND_ENV, so
#                             the production instance can be swapped without
#                             rewriting the whole FRONTEND_ENV
#   IN_CLERK_PROXY_URL        optional; replaces any proxy in FRONTEND_ENV
#   IN_SUPABASE_ANON_KEY      optional; replaces any anon key in FRONTEND_ENV.
#                             Without one the BreathFlow sync client is null
#
# --preview also turns the service worker off and points the API at the
# PR's sidecar (/preview/pr/<n>).
set -euo pipefail
umask 077

usage() {
  echo "usage: $0 <out-file> [--preview <pr-number>]" >&2
  exit 2
}

[ $# -ge 1 ] || usage
OUT="$1"
shift
PREVIEW_PR=""
if [ $# -gt 0 ]; then
  if [ "$1" != "--preview" ] || [ $# -ne 2 ]; then usage; fi
  PREVIEW_PR="$2"
  case "$PREVIEW_PR" in
    '' | *[!0-9]*) usage ;;
  esac
fi

FRONTEND_ENV="${FRONTEND_ENV:-}"
IN_CLERK_PUBLISHABLE_KEY="${IN_CLERK_PUBLISHABLE_KEY:-}"
IN_CLERK_PROXY_URL="${IN_CLERK_PROXY_URL:-}"
IN_SUPABASE_ANON_KEY="${IN_SUPABASE_ANON_KEY:-}"

if [ -z "$FRONTEND_ENV" ]; then
  echo "::error::FRONTEND_ENV secret is missing."
  exit 1
fi
if [ -z "$IN_CLERK_PUBLISHABLE_KEY" ]; then
  echo "::error::VITE_CLERK_PUBLISHABLE_KEY secret is missing."
  exit 1
fi

# Lines of FRONTEND_ENV that are replaced below, or must never ship:
# VITE_DEV_BEARER is the local-dev Clerk bypass.
DROP="VITE_DEV_BEARER|VITE_CLERK_PUBLISHABLE_KEY"
if [ -n "$IN_CLERK_PROXY_URL" ]; then DROP="$DROP|VITE_CLERK_PROXY_URL"; fi
if [ -n "$IN_SUPABASE_ANON_KEY" ]; then DROP="$DROP|VITE_SUPABASE_ANON_KEY"; fi
if [ -n "$PREVIEW_PR" ]; then DROP="$DROP|VITE_ENABLE_SERVICE_WORKER|VITE_API_BASE"; fi

{
  printf '%s\n' "$FRONTEND_ENV" | sed -E "/^[[:space:]]*($DROP)=/d"
  printf 'VITE_CLERK_PUBLISHABLE_KEY=%s\n' "$IN_CLERK_PUBLISHABLE_KEY"
  if [ -n "$IN_CLERK_PROXY_URL" ]; then
    printf 'VITE_CLERK_PROXY_URL=%s\n' "$IN_CLERK_PROXY_URL"
  fi
  if [ -n "$IN_SUPABASE_ANON_KEY" ]; then
    printf 'VITE_SUPABASE_ANON_KEY=%s\n' "$IN_SUPABASE_ANON_KEY"
  fi
  if [ -n "$PREVIEW_PR" ]; then
    printf 'VITE_ENABLE_SERVICE_WORKER=false\n'
    printf 'VITE_API_BASE=/preview/pr/%s\n' "$PREVIEW_PR"
  fi
} > "$OUT"
