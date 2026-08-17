#!/usr/bin/env bash
# Run a local script on the droplet over SSH.
# Env: SSH_HOST, SSH_USERNAME, SSH_KEY (PEM contents or path), plus any
# extra vars listed after -- that should be forwarded (NAME=value).
#
#   bash deploy/ci/ssh-remote.sh deploy/ci/swap-pm2.sh
#   bash deploy/ci/ssh-remote.sh deploy/ci/preview-publish-remote.sh -- PR_NUMBER=12
set -euo pipefail
# shellcheck source=lib.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

SCRIPT_PATH="${1:-}"
[[ -n "$SCRIPT_PATH" ]] || ci_die "usage: ssh-remote.sh <script> [-- NAME=value ...]"
shift
if [[ "${1:-}" == "--" ]]; then
  shift
fi

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

REMOTE_ENV=()
for assignment in "$@"; do
  REMOTE_ENV+=("$assignment")
done

# Forward deploy knobs when set so Origin and GitHub share one droplet script.
if [[ -n "${DEPLOY_GIT_URL:-}" ]]; then
  REMOTE_ENV+=("DEPLOY_GIT_URL=$DEPLOY_GIT_URL")
fi
if [[ -n "${DEPLOY_GIT_BRANCH:-}" ]]; then
  REMOTE_ENV+=("DEPLOY_GIT_BRANCH=$DEPLOY_GIT_BRANCH")
fi
if [[ -n "${PR_NUMBER:-}" ]]; then
  REMOTE_ENV+=("PR_NUMBER=$PR_NUMBER")
fi

ci_log "ssh ${SSH_USERNAME}@${SSH_HOST} $(basename "$SCRIPT_PATH")"
# shellcheck disable=SC2029
ssh -i "$KEY_FILE" \
  -o IdentitiesOnly=yes \
  -o StrictHostKeyChecking=accept-new \
  "${SSH_USERNAME}@${SSH_HOST}" \
  env "${REMOTE_ENV[@]}" bash -s < "$SCRIPT_PATH"
