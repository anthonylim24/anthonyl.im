#!/usr/bin/env bash
# Post-deploy smoke. Same probes as .github/workflows/deploy.yml.
set -euo pipefail
# shellcheck source=lib.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

BASE="${SMOKE_BASE:-https://anthonyl.im}"
ci_log "waiting for /health on $BASE"
OK=0
for attempt in 1 2 3 4 5 6; do
  if BODY="$(curl -fsSL --max-time 10 "$BASE/health" 2>/dev/null)"; then
    if echo "$BODY" | grep -q '"status":"ok"'; then
      ci_log "/health OK on attempt $attempt — $BODY"
      OK=1
      break
    fi
    ci_log "/health returned unexpected body: $BODY"
  else
    ci_log "/health not ready (attempt $attempt)"
  fi
  sleep 3
done
if [[ "$OK" -ne 1 ]]; then
  ci_die "Post-deploy smoke failed — $BASE/health did not return status ok"
fi

PATHS=("/" "/chatbot" "/breathwork" "/korea" "/trips")
for path in "${PATHS[@]}"; do
  URL="${BASE}${path}"
  OK=0
  for attempt in 1 2 3; do
    ci_log "attempt $attempt — GET $URL"
    if BODY="$(curl -fsSL --max-time 15 "$URL")"; then
      if echo "$BODY" | grep -q '<div id="root">'; then
        ci_log "OK — SPA shell served for $path"
        OK=1
        break
      fi
      ci_log "WARN: 200 OK but SPA shell missing for $path; retrying"
    fi
    sleep 3
  done
  if [[ "$OK" -ne 1 ]]; then
    ci_die "Post-deploy smoke failed — $URL is not serving the SPA shell"
  fi
done
ci_log "all routes OK"
