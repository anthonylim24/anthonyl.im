#!/usr/bin/env bash
# Runs ON the droplet. Atomic next→live swap + PM2 restart + rollback.
# Same steps as .github/workflows/deploy.yml "Atomic swap + PM2 restart".
set -euo pipefail
# Non-interactive SSH inherits a minimal PATH that often omits
# /usr/local/bin (where `sudo npm install -g` lands binaries).
export PATH="$HOME/.bun/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

LIVE="$HOME/anthonyl.im"
NEXT="$HOME/anthonyl.im.next"
PREV="$HOME/anthonyl.im.prev"

if [ ! -f "$NEXT/frontend/dist/index.html" ]; then
  echo "ERROR: $NEXT/frontend/dist/index.html not found"
  ls -laR "$NEXT/frontend/" 2>/dev/null || echo "frontend/ dir missing"
  exit 1
fi
echo "dist verified: $(ls "$NEXT/frontend/dist/" | wc -l) entries"

if ! command -v pm2 >/dev/null 2>&1; then
  bun add -g pm2
fi

echo "[deploy] PATH=$PATH"
echo "[deploy] yt-dlp: $(command -v yt-dlp >/dev/null && which yt-dlp || echo MISSING)"
echo "[deploy] ffmpeg: $(command -v ffmpeg >/dev/null && which ffmpeg || echo MISSING)"
echo "[deploy] dev-browser: $(command -v dev-browser >/dev/null && which dev-browser || echo MISSING)"

# Atomic swap: live → prev, next → live. Downtime is only the
# PM2 restart window, not a missing directory during clone.
rm -rf "$PREV"
if [ -d "$LIVE" ]; then
  mv "$LIVE" "$PREV"
fi
mv "$NEXT" "$LIVE"

pm2 delete anthonyl.im 2>/dev/null || true
cd "$LIVE"
# --update-env so PM2 captures the explicit PATH we just set
# rather than the daemon's stale environment from a previous
# deploy (which may not have included /usr/local/bin).
pm2 start bun --name anthonyl.im --update-env -- run index.ts

sleep 3
pm2 logs anthonyl.im --lines 15 --nostream
echo ""

if pm2 show anthonyl.im | grep -q "status.*online"; then
  echo 'Deployment successful to Digital Ocean'
  rm -rf "$PREV"
else
  echo "ERROR: Process is not online — attempting rollback to prev"
  pm2 show anthonyl.im
  if [ -d "$PREV" ]; then
    pm2 delete anthonyl.im 2>/dev/null || true
    rm -rf "$LIVE"
    mv "$PREV" "$LIVE"
    cd "$LIVE"
    pm2 start bun --name anthonyl.im --update-env -- run index.ts
    echo "[deploy] rolled back to previous release"
  fi
  exit 1
fi
