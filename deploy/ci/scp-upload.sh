#!/usr/bin/env bash
# SCP local files onto the droplet. Recreates appleboy/scp-action layout:
# source paths are preserved under target/.
#
#   bash deploy/ci/scp-upload.sh anthonyl.im.next frontend/dist
#   bash deploy/ci/scp-upload.sh "previews/.incoming/12" preview-pr.tar.gz preview-api.tar.gz deploy/publish-preview.sh
set -euo pipefail
# shellcheck source=lib.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

TARGET="${1:-}"
shift || true
[[ -n "$TARGET" ]] || ci_die "usage: scp-upload.sh <remote-target> <local-path>..."
[[ $# -ge 1 ]] || ci_die "usage: scp-upload.sh <remote-target> <local-path>..."
[[ -n "${SSH_HOST:-}" ]] || ci_die "SSH_HOST is required"
[[ -n "${SSH_USERNAME:-}" ]] || ci_die "SSH_USERNAME is required"
[[ -n "${SSH_KEY:-}" ]] || ci_die "SSH_KEY is required"

KEY_FILE=""
CLEANUP_KEY=0
if [[ -f "$SSH_KEY" ]]; then
  KEY_FILE="$SSH_KEY"
else
  KEY_FILE="$(mktemp)"
  CLEANUP_KEY=1
  umask 077
  printf '%s\n' "$SSH_KEY" > "$KEY_FILE"
  chmod 600 "$KEY_FILE"
fi

cleanup() {
  if [[ "$CLEANUP_KEY" -eq 1 ]]; then
    rm -f "$KEY_FILE"
  fi
}
trap cleanup EXIT

SSH_OPTS=(-i "$KEY_FILE" -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new)
REMOTE="${SSH_USERNAME}@${SSH_HOST}"

ssh "${SSH_OPTS[@]}" "$REMOTE" "mkdir -p \"$TARGET\""

for src in "$@"; do
  [[ -e "$src" ]] || ci_die "local path missing: $src"
  dest="$TARGET/$src"
  dest_dir="$(dirname "$dest")"
  ssh "${SSH_OPTS[@]}" "$REMOTE" "mkdir -p \"$dest_dir\""
  ci_log "scp $src → $REMOTE:$dest"
  scp -r "${SSH_OPTS[@]}" "$src" "$REMOTE:$dest"
done
