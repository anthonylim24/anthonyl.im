# Shared helpers for portable CI jobs (GitHub Actions, Depot, Origin).
# shellcheck shell=bash

if [[ -n "${ANTHONYL_CI_LIB_SOURCED:-}" ]]; then
  return 0
fi
ANTHONYL_CI_LIB_SOURCED=1

CI_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

export KLUSTER_API_KEY="${KLUSTER_API_KEY:-ci-stub}"
export KLUSTER_API_BASE_URL="${KLUSTER_API_BASE_URL:-https://example.invalid}"
export IG_WORKER_ENABLED="${IG_WORKER_ENABLED:-false}"

ci_log() {
  printf '[ci] %s\n' "$*"
}

ci_die() {
  printf '[ci] ERROR: %s\n' "$*" >&2
  exit 1
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || ci_die "missing required command: $1"
}
