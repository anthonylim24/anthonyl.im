#!/usr/bin/env bash
# Stamp preview.json + HTML chrome. Same as the preview.yml stamp step.
set -euo pipefail
# shellcheck source=lib.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"
cd "$CI_ROOT"
require_cmd bun

PR_NUMBER="${PR_NUMBER:-}"
PR_SHA="${PR_SHA:-}"
PR_URL="${PR_URL:-}"
PREVIEW_SITE_URL="${PREVIEW_SITE_URL:-https://anthonyl.im}"

[[ "$PR_NUMBER" =~ ^[0-9]{1,10}$ ]] || ci_die "PR_NUMBER must be a numeric PR id"
[[ -n "$PR_SHA" ]] || ci_die "PR_SHA is required"
[[ -n "$PR_URL" ]] || ci_die "PR_URL is required"

bun server/src/previewStamp.ts \
  --dir frontend/dist \
  --pr "$PR_NUMBER" \
  --sha "$PR_SHA" \
  --html-url "$PR_URL" \
  --site-url "$PREVIEW_SITE_URL"

test -f frontend/dist/preview.json || ci_die "preview.json was not written"
grep -q 'data-pr-preview=' frontend/dist/index.html \
  || ci_die "preview chrome marker missing from index.html"
