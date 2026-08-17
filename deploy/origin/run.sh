#!/usr/bin/env bash
# Origin CI entrypoint. Same jobs as GitHub Actions, plus Origin check-runs
# and sticky PR comments when ORIGIN_INSTALLATION_TOKEN is set.
#
#   bash deploy/origin/run.sh pr-checks
#   bash deploy/origin/run.sh preview
#   bash deploy/origin/run.sh preview-cleanup
#   bash deploy/origin/run.sh deploy
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck source=../ci/lib.sh
source "$ROOT/deploy/ci/lib.sh"
cd "$CI_ROOT"

COMMAND="${1:-}"
[[ -n "$COMMAND" ]] || ci_die "usage: run.sh pr-checks|preview|preview-cleanup|deploy"

CLI=(bun "$CI_ROOT/server/src/originCi/cli.ts")
HAVE_ORIGIN=0
if [[ -n "${ORIGIN_INSTALLATION_TOKEN:-}${ORIGIN_TOKEN:-}${CURSOR_AUTH_TOKEN:-}" ]]; then
  HAVE_ORIGIN=1
fi

report() {
  local key="$1" status="$2" conclusion="${3:-}" title="${4:-}" summary="${5:-}"
  if [[ "$HAVE_ORIGIN" -ne 1 ]]; then
    ci_log "skip Origin check $key ($status) — no ORIGIN_INSTALLATION_TOKEN"
    return 0
  fi
  local args=(report-check --key "$key" --status "$status")
  [[ -n "$conclusion" ]] && args+=(--conclusion "$conclusion")
  [[ -n "$title" ]] && args+=(--title "$title")
  [[ -n "$summary" ]] && args+=(--summary "$summary")
  "${CLI[@]}" "${args[@]}" || ci_log "WARN: failed to report Origin check $key"
}

run_job() {
  local key="$1"
  shift
  report "$key" in_progress "" "Running $key" ""
  local started=$SECONDS
  if "$@"; then
    report "$key" completed success "Passed $key" "elapsed $((SECONDS - started))s"
    return 0
  fi
  local code=$?
  report "$key" completed failure "Failed $key" "exit $code after $((SECONDS - started))s"
  return "$code"
}

post_preview_comment() {
  local mode="$1"
  local body
  body="$(bash "$CI_ROOT/deploy/ci/preview-comment-body.sh" "$mode")"
  if [[ "$HAVE_ORIGIN" -eq 1 ]]; then
    printf '%s\n' "$body" | "${CLI[@]}" sticky-comment --pr "$PR_NUMBER" --body-file -
  else
    printf '%s\n' "$body"
  fi
}

install_ci_deps() {
  require_cmd bun
  ci_log "bun install --frozen-lockfile (root + frontend)"
  bun install --frozen-lockfile
  (cd frontend && bun install --frozen-lockfile)
}

case "$COMMAND" in
  pr-checks)
    install_ci_deps
    failed=0
    run_job pr-server-tests bash "$CI_ROOT/deploy/ci/server-tests.sh" || failed=1
    run_job pr-frontend-typecheck bash "$CI_ROOT/deploy/ci/frontend-typecheck.sh" || failed=1
    run_job pr-frontend-build env MODE=stub bash "$CI_ROOT/deploy/ci/frontend-build.sh" || failed=1
    run_job pr-frontend-tests bash "$CI_ROOT/deploy/ci/frontend-tests.sh" || failed=1
    run_job pr-cloud-setup bash "$CI_ROOT/deploy/ci/cloud-setup.sh" || failed=1
    if [[ "$HAVE_ORIGIN" -eq 1 ]]; then
      "${CLI[@]}" pr-gate || true
    fi
    if [[ "$failed" -ne 0 ]]; then
      ci_die "one or more PR checks failed"
    fi
    ci_log "all PR checks passed"
    ;;

  preview)
    if [[ "${ORIGIN_PREVIEW_ENABLED:-true}" != "true" ]]; then
      ci_log "ORIGIN_PREVIEW_ENABLED is not true — skip preview publish"
      exit 0
    fi
    [[ -n "${PR_NUMBER:-}" ]] || ci_die "PR_NUMBER is required"
    [[ -n "${PR_SHA:-${ORIGIN_HEAD_SHA:-}}" ]] || ci_die "PR_SHA or ORIGIN_HEAD_SHA is required"
    export PR_SHA="${PR_SHA:-$ORIGIN_HEAD_SHA}"
    export ORIGIN_HEAD_SHA="${ORIGIN_HEAD_SHA:-$PR_SHA}"
    export PREVIEW_URL="${PREVIEW_URL:-https://anthonyl.im/preview/pr/${PR_NUMBER}/}"
    export PR_URL="${PR_URL:-$PREVIEW_URL}"
    export PREVIEW_SITE_URL="${PREVIEW_SITE_URL:-https://anthonyl.im}"
    export COMMIT_URL="${COMMIT_URL:-https://github.com/anthonylim24/anthonyl.im/commit/${PR_SHA}}"
    export RUN_URL="${RUN_URL:-${ORIGIN_DETAILS_URL:-}}"

    install_ci_deps
    report preview in_progress "" "Publishing preview" "PR $PR_NUMBER"
    if ! bash "$CI_ROOT/deploy/ci/preview-build.sh"; then
      report preview completed failure "Preview build failed" ""
      post_preview_comment failed
      exit 1
    fi
    bash "$CI_ROOT/deploy/ci/preview-stamp.sh"
    bash "$CI_ROOT/deploy/ci/preview-pack.sh"
    bash "$CI_ROOT/deploy/ci/scp-upload.sh" "previews/.incoming/${PR_NUMBER}" \
      preview-pr.tar.gz preview-api.tar.gz deploy/publish-preview.sh
    bash "$CI_ROOT/deploy/ci/ssh-remote.sh" "$CI_ROOT/deploy/ci/preview-publish-remote.sh" -- "PR_NUMBER=$PR_NUMBER"

    NOTE="Open on a phone or in any browser — no laptop dev server."
    if ! curl -fsS --max-time 10 "${PREVIEW_URL}preview.json" | grep -q "\"pr\": ${PR_NUMBER}"; then
      NOTE="Files are on the droplet. The preview URL goes live after the preview-serving Hono routes are deployed to production. Until then, \`GET ${PREVIEW_URL}preview.json\` will not match."
    fi
    export NOTE
    post_preview_comment success
    report preview completed success "Preview published" "$PREVIEW_URL"
    ;;

  preview-cleanup)
    [[ -n "${PR_NUMBER:-}" ]] || ci_die "PR_NUMBER is required"
    bash "$CI_ROOT/deploy/ci/ssh-remote.sh" "$CI_ROOT/deploy/ci/preview-cleanup-remote.sh" -- "PR_NUMBER=$PR_NUMBER"
    post_preview_comment removed
    ;;

  deploy)
    if [[ "${ORIGIN_DEPLOY_ENABLED:-}" != "true" ]]; then
      ci_die "Refusing Origin production deploy unless ORIGIN_DEPLOY_ENABLED=true (prevents a double-ship with GitHub Actions). Set it on the Origin/Depot secret store when you cut over."
    fi
    install_ci_deps
    report deploy in_progress "" "Deploying to droplet" ""
    bash "$CI_ROOT/deploy/ci/server-tests.sh"
    MODE=production bash "$CI_ROOT/deploy/ci/frontend-build.sh"
    bash "$CI_ROOT/deploy/ci/ssh-remote.sh" "$CI_ROOT/deploy/ci/stage-backend.sh"
    bash "$CI_ROOT/deploy/ci/scp-upload.sh" anthonyl.im.next frontend/dist
    bash "$CI_ROOT/deploy/ci/ssh-remote.sh" "$CI_ROOT/deploy/ci/swap-pm2.sh"
    bash "$CI_ROOT/deploy/ci/smoke.sh"
    report deploy completed success "Deployed" "https://anthonyl.im"
    ;;

  *)
    ci_die "unknown command: $COMMAND"
    ;;
esac
