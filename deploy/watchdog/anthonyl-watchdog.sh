#!/usr/bin/env bash
# Restarts the app when it stops answering. PM2 already restarts a process
# that exits; this covers one that is still running but hung. Run every
# minute by anthonyl-watchdog.timer.
set -u

URL="${WATCHDOG_URL:-http://127.0.0.1:3000/health}"
APP="${WATCHDOG_APP:-anthonyl.im}"
STATE="${WATCHDOG_STATE:-/run/anthonyl-watchdog.fails}"
THRESHOLD="${WATCHDOG_THRESHOLD:-3}"
PM2="${WATCHDOG_PM2:-/root/.bun/install/global/node_modules/pm2/bin/pm2}"
# A deploy stops and starts the app on purpose; leave it alone while one runs.
DEPLOY_DIR="${WATCHDOG_DEPLOY_DIR:-/root/anthonyl.im.next}"

if curl -fsS --max-time 5 "$URL" 2>/dev/null | grep -q '"status":"ok"'; then
  rm -f "$STATE"
  exit 0
fi

# (A staging directory older than 15 minutes is left over from a failed deploy.)
if [ -n "$(find "$DEPLOY_DIR" -maxdepth 0 -mmin -15 2>/dev/null)" ]; then
  echo "health check failed, but a deploy is in progress; not restarting"
  exit 0
fi

fails=$(( $(cat "$STATE" 2>/dev/null || echo 0) + 1 ))
echo "$fails" > "$STATE"
echo "health check failed ($fails/$THRESHOLD): $URL"

if [ "$fails" -ge "$THRESHOLD" ]; then
  echo "restarting $APP"
  "$PM2" restart "$APP" --update-env && rm -f "$STATE"
fi
