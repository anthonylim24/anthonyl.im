#!/usr/bin/env bash
# Publish / remove / prune remote PR preview trees on the droplet.
#
# The GitHub Actions preview workflow SCPs this script from the PR checkout
# (so it works before the matching code is on main) then runs:
#
#   bash publish-preview.sh publish <pr> <tarball>
#   bash publish-preview.sh remove  <pr>
#   bash publish-preview.sh prune
#
# Live tree:  $PREVIEW_ROOT/<pr>/
# Staging:    $PREVIEW_ROOT/.staging/<pr>/
# Preview API (optional 4th arg): loopback bun process, proxied by production
# Hono at /preview/pr/<n>/api/*. Cap: PREVIEW_API_MAX (default 1) so the
# 1 GB droplet does not run a stack of sidecars.
set -euo pipefail

PREVIEW_ROOT="${PREVIEW_ROOT:-$HOME/previews}"
MAX_AGE_DAYS="${PREVIEW_MAX_AGE_DAYS:-14}"
MAX_COUNT="${PREVIEW_MAX_COUNT:-20}"
PREVIEW_API_MAX="${PREVIEW_API_MAX:-1}"
PROD_ROOT="${PROD_ROOT:-$HOME/anthonyl.im}"
PROD_ENV="${PROD_ENV:-$HOME/.env}"
STAGING="$PREVIEW_ROOT/.staging"
LOCK_DIR="$PREVIEW_ROOT/.locks"

log() { printf '[preview] %s\n' "$*"; }

die() {
  printf '[preview] ERROR: %s\n' "$*" >&2
  exit 1
}

assert_pr() {
  local pr="$1"
  [[ "$pr" =~ ^[0-9]{1,10}$ ]] || die "invalid PR id: $pr"
}

is_pr_dir() {
  [[ "$(basename "$1")" =~ ^[0-9]{1,10}$ ]]
}

# Reject tarball members that would write outside the extract directory.
assert_safe_tarball() {
  local tarball="$1"
  local member
  while IFS= read -r member; do
    [ -n "$member" ] || continue
    if [[ "$member" = /* ]]; then
      die "unsafe tar member (absolute): $member"
    fi
    local rest="$member"
    while [ -n "$rest" ]; do
      local part="${rest%%/*}"
      if [ "$part" = ".." ]; then
        die "unsafe tar member (traversal): $member"
      fi
      [ "$rest" = "$part" ] && break
      rest="${rest#*/}"
    done
  done < <(tar -tzf "$tarball")
}

# Advisory lock for extract / swap / prune. The file name is `publish.lock`
# (not `global.lock`) so a leaked FD on the old name cannot deadlock us.
# Never leave FD 9 open across `nohup bun` — the sidecar would hold the
# lock for its whole lifetime and every later publish would time out.
acquire_lock() {
  mkdir -p "$LOCK_DIR"
  exec 9>"$LOCK_DIR/publish.lock"
  flock -w 120 9 || die "could not acquire preview lock"
}

release_lock() {
  flock -u 9 2>/dev/null || true
  exec 9>&-
}

stop_preview_api() {
  local dir="$1"
  [ -d "$dir" ] || return 0
  if [ -f "$dir/api.pid" ]; then
    local pid
    pid="$(cat "$dir/api.pid" 2>/dev/null || true)"
    if [ -n "${pid:-}" ] && kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
      sleep 0.3
      kill -9 "$pid" 2>/dev/null || true
    fi
  fi
  rm -f "$dir/api.pid" "$dir/api.json"
}

stop_other_preview_apis() {
  local keep="$1"
  local dir
  for dir in "$PREVIEW_ROOT"/*; do
    [ -d "$dir" ] || continue
    is_pr_dir "$dir" || continue
    [ "$(basename "$dir")" = "$keep" ] && continue
    if [ -f "$dir/api.pid" ] || [ -f "$dir/api.json" ]; then
      log "stopping preview API for PR $(basename "$dir") (cap $PREVIEW_API_MAX)"
      stop_preview_api "$dir"
    fi
  done
}

pick_preview_api_port() {
  local pr="$1"
  local port=$((4100 + (pr % 500)))
  local i
  for i in $(seq 0 20); do
    local candidate=$((port + i))
    if ! ss -ltn 2>/dev/null | awk '{print $4}' | grep -q ":${candidate}$"; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done
  die "no free preview API port near $port"
}

start_preview_api() {
  local pr="$1"
  local live="$2"
  local api_tarball="$3"
  [ -f "$api_tarball" ] || return 0

  assert_safe_tarball "$api_tarball"
  local api_src="$live/api-src"
  rm -rf "$api_src"
  mkdir -p "$api_src"
  tar --no-same-owner --no-same-permissions -xzf "$api_tarball" -C "$api_src"
  [ -f "$api_src/server/src/previewApi.ts" ] || die "api tarball missing server/src/previewApi.ts"

  stop_other_preview_apis "$pr"
  stop_preview_api "$live"

  local port
  port="$(pick_preview_api_port "$pr")"

  local bun_bin
  bun_bin="$(command -v bun || true)"
  [ -n "$bun_bin" ] || bun_bin="$HOME/.bun/bin/bun"
  [ -x "$bun_bin" ] || die "bun not found for preview API"

  local modules="$PROD_ROOT/node_modules"
  [ -d "$modules" ] || die "production node_modules missing at $modules (needed by preview API)"

  (
    # Drop the publish flock so the long-lived sidecar cannot inherit it.
    exec 9>&-
    set -a
    if [ -f "$PROD_ENV" ]; then
      # shellcheck disable=SC1090
      . "$PROD_ENV"
    fi
    set +a
    export IG_WORKER_ENABLED=false
    export PREVIEW_API=1
    export PORT="$port"
    export PREVIEW_API_HOST=127.0.0.1
    export NODE_ENV=production
    export NODE_PATH="$modules"
    cd "$api_src"
    nohup "$bun_bin" --smol server/src/previewApi.ts >"$live/api.log" 2>&1 9>&- &
    echo $! >"$live/api.pid"
  )

  local pid
  pid="$(cat "$live/api.pid")"
  printf '{"port":%s,"pid":%s}\n' "$port" "$pid" >"$live/api.json"

  local attempt
  for attempt in 1 2 3 4 5 6 7 8; do
    if curl -fsS --max-time 2 "http://127.0.0.1:${port}/health" | grep -q '"previewApi":true'; then
      log "preview API for PR $pr on 127.0.0.1:$port (pid $pid)"
      return 0
    fi
    sleep 1
  done
  log "preview API did not become healthy — see $live/api.log"
  return 0
}

cmd="${1:-}"
case "$cmd" in
  publish)
    pr="${2:-}"
    tarball="${3:-}"
    api_tarball="${4:-}"
    assert_pr "$pr"
    [ -n "$tarball" ] || die "usage: publish-preview.sh publish <pr> <tarball> [api-tarball]"
    [ -f "$tarball" ] || die "tarball not found: $tarball"
    acquire_lock
    assert_safe_tarball "$tarball"

    mkdir -p "$STAGING"
    stage="$STAGING/$pr"
    live="$PREVIEW_ROOT/$pr"
    rm -rf "$stage"
    mkdir -p "$stage"
    tar --no-same-owner --no-same-permissions -xzf "$tarball" -C "$stage"

    [ -f "$stage/index.html" ] || die "extracted tree missing index.html"
    [ -f "$stage/preview.json" ] || die "extracted tree missing preview.json"
    grep -q 'id="root"' "$stage/index.html" || die "index.html is not an SPA shell"

    mkdir -p "$PREVIEW_ROOT"
    # Rename-aside then rename-in. Same filesystem; a concurrent GET may 404
    # for a few milliseconds, which is acceptable for previews. Never delete
    # `$live` before the replacement exists.
    old="$STAGING/$pr.prev"
    stop_preview_api "$live"
    rm -rf "$old"
    if [ -d "$live" ]; then
      mv "$live" "$old"
    fi
    mv "$stage" "$live"
    rm -rf "$old"
    log "published $live ($(wc -c < "$live/index.html") bytes index.html)"
    # Sidecar boot (health polls, other-API teardown) must not hold the lock.
    release_lock
    if [ -n "$api_tarball" ]; then
      start_preview_api "$pr" "$live" "$api_tarball" || true
    fi
    ;;

  remove)
    pr="${2:-}"
    assert_pr "$pr"
    acquire_lock
    stop_preview_api "$PREVIEW_ROOT/$pr"
    rm -rf "$PREVIEW_ROOT/$pr" "$STAGING/$pr"
    log "removed PR $pr"
    ;;

  prune)
    acquire_lock
    mkdir -p "$PREVIEW_ROOT"
    # Drop leftover staging dirs first — they are never served.
    rm -rf "$STAGING"
    # mtime is set when the staging tree is mv'd into place.
    find "$PREVIEW_ROOT" -mindepth 1 -maxdepth 1 -type d -mtime +"$MAX_AGE_DAYS" -print0 \
      | while IFS= read -r -d '' dir; do
          is_pr_dir "$dir" || continue
          log "pruning stale PR $(basename "$dir") (mtime > ${MAX_AGE_DAYS}d)"
          stop_preview_api "$dir"
          rm -rf "$dir"
        done

    mapfile -t remaining < <(
      find "$PREVIEW_ROOT" -mindepth 1 -maxdepth 1 -type d -printf '%T@ %p\n' 2>/dev/null \
        | sort -n \
        | awk '{print $2}' \
        | while IFS= read -r dir; do
            is_pr_dir "$dir" && printf '%s\n' "$dir"
          done
    )
    count="${#remaining[@]}"
    if [ "$count" -gt "$MAX_COUNT" ]; then
      extra=$((count - MAX_COUNT))
      for ((i = 0; i < extra; i++)); do
        log "pruning oldest preview ${remaining[$i]} (cap $MAX_COUNT)"
        stop_preview_api "${remaining[$i]}"
        rm -rf "${remaining[$i]}"
      done
    fi
    log "prune complete"
    ;;

  *)
    die "usage: publish-preview.sh <publish|remove|prune> ...  (publish <pr> <tarball> [api-tarball])"
    ;;
esac
