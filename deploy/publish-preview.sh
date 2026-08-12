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
set -euo pipefail

PREVIEW_ROOT="${PREVIEW_ROOT:-$HOME/previews}"
MAX_AGE_DAYS="${PREVIEW_MAX_AGE_DAYS:-14}"
MAX_COUNT="${PREVIEW_MAX_COUNT:-20}"
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

acquire_lock() {
  mkdir -p "$LOCK_DIR"
  exec 9>"$LOCK_DIR/global.lock"
  flock -w 120 9 || die "could not acquire preview lock"
}

cmd="${1:-}"
case "$cmd" in
  publish)
    pr="${2:-}"
    tarball="${3:-}"
    assert_pr "$pr"
    [ -n "$tarball" ] || die "usage: publish-preview.sh publish <pr> <tarball>"
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
    rm -rf "$old"
    if [ -d "$live" ]; then
      mv "$live" "$old"
    fi
    mv "$stage" "$live"
    rm -rf "$old"
    log "published $live ($(wc -c < "$live/index.html") bytes index.html)"
    ;;

  remove)
    pr="${2:-}"
    assert_pr "$pr"
    acquire_lock
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
        rm -rf "${remaining[$i]}"
      done
    fi
    log "prune complete"
    ;;

  *)
    die "usage: publish-preview.sh <publish|remove|prune> ..."
    ;;
esac
