#!/usr/bin/env bash
# Print the sticky <!-- pr-preview --> comment body.
# MODE=success|failed|removed
set -euo pipefail

MODE="${1:-success}"
PR_NUMBER="${PR_NUMBER:-}"
PR_SHA="${PR_SHA:-}"
PREVIEW_URL="${PREVIEW_URL:-https://anthonyl.im/preview/pr/${PR_NUMBER}/}"
COMMIT_URL="${COMMIT_URL:-https://github.com/anthonylim24/anthonyl.im/commit/${PR_SHA}}"
RUN_URL="${RUN_URL:-}"
NOTE="${NOTE:-Open on a phone or in any browser — no laptop dev server.}"

SHORT_SHA="${PR_SHA:0:7}"

if [[ "$MODE" == "removed" ]]; then
  cat <<EOF
<!-- pr-preview -->
## Preview

This pull request is closed — the remote preview has been removed.
EOF
  exit 0
fi

if [[ "$MODE" == "failed" ]]; then
  cat <<EOF
<!-- pr-preview -->
## Preview

Preview publish **failed** for commit \`${SHORT_SHA}\`. See the [workflow run](${RUN_URL}).
EOF
  exit 0
fi

cat <<EOF
<!-- pr-preview -->
## Preview

**${PREVIEW_URL}**

| App | URL |
| --- | --- |
| Chatbot | [${PREVIEW_URL}](${PREVIEW_URL}) |
| BreathFlow | [${PREVIEW_URL}breathwork](${PREVIEW_URL}breathwork) |
| Korea | [${PREVIEW_URL}korea](${PREVIEW_URL}korea) |
| Trips | [${PREVIEW_URL}trips](${PREVIEW_URL}trips) |

Commit [\`${SHORT_SHA}\`](${COMMIT_URL}) · [workflow run](${RUN_URL})

${NOTE}

**Agents:** \`bun scripts/wait-for-preview.ts --pr ${PR_NUMBER} --sha ${PR_SHA}\`. Then \`bun scripts/clerk-agent-login.ts --pr ${PR_NUMBER} --path /korea\` (applies a screenshot-user session for Korea + Trips; do not paste the ticket URL). The helper re-execs from \`origin/main\` before sending secrets. Cursor cloud \`gh\` tokens have no push — \`CLERK_SECRET_KEY\` is enough. Do not bake \`VITE_DEV_BEARER\`, do not sign in to production \`/korea\` or \`/trips\`. Screenshot with \`?hidePreviewChrome=1\`. Frontend calls \`/preview/pr/${PR_NUMBER}/api/*\` only (no production \`/api\` fallback). See \`docs/pr-previews.md\`.
EOF
