#!/usr/bin/env bash
# Runs ON the droplet after SCP of preview tarballs.
# Same steps as .github/workflows/preview.yml "Publish on droplet".
set -euo pipefail
PR="${PR_NUMBER:-}"
[[ "$PR" =~ ^[0-9]{1,10}$ ]] || { echo "PR_NUMBER must be numeric" >&2; exit 1; }

INCOMING="$HOME/previews/.incoming/$PR"
SCRIPT="$INCOMING/deploy/publish-preview.sh"
TARBALL="$INCOMING/preview-pr.tar.gz"
API_TARBALL="$INCOMING/preview-api.tar.gz"
[ -f "$SCRIPT" ] || SCRIPT="$INCOMING/publish-preview.sh"
chmod +x "$SCRIPT"
if [ -f "$API_TARBALL" ]; then
  bash "$SCRIPT" publish "$PR" "$TARBALL" "$API_TARBALL"
else
  bash "$SCRIPT" publish "$PR" "$TARBALL"
fi
bash "$SCRIPT" prune || true
rm -rf "$INCOMING"

echo "[preview] local smoke against Hono"
for attempt in 1 2 3 4 5; do
  if BODY="$(curl -fsS --max-time 5 "http://127.0.0.1:3000/preview/pr/${PR}/preview.json" 2>/dev/null)"; then
    if echo "$BODY" | grep -q "\"pr\": ${PR}"; then
      echo "[preview] live — $BODY"
      exit 0
    fi
    echo "[preview] unexpected body: $BODY"
  else
    echo "[preview] not serving yet (attempt $attempt) — serving code may not be on production yet"
  fi
  sleep 2
done
echo "[preview] uploaded; public URL pending production Hono preview routes"
exit 0
