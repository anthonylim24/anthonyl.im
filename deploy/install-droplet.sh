#!/usr/bin/env bash
# Installs the droplet-side pieces that live outside the app: the nginx site,
# the outage page, and (through install-service.sh, which every deploy also
# runs) the server's systemd unit and the health watchdog. Starts the server
# if it is not running. Safe to run again. Run as root on the droplet from a
# checkout of this repo:
#
#   bash deploy/install-droplet.sh
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
STAMP="$(date +%Y%m%d-%H%M%S)"

echo "[install] outage page"
install -d /var/www/anthonyl.im
install -m 644 "$HERE/nginx/unavailable.html" /var/www/anthonyl.im/__unavailable.html

echo "[install] nginx site"
SITE=/etc/nginx/sites-available/anthonyl.im
LINK=/etc/nginx/sites-enabled/anthonyl.im
if [ -e "$LINK" ] && ! cmp -s "$HERE/nginx/anthonyl.im.conf" "$LINK"; then
  cp -L "$LINK" "/root/nginx-anthonyl.im.bak-$STAMP"
fi
install -m 644 "$HERE/nginx/anthonyl.im.conf" "$SITE"
# sites-enabled may hold a regular file from the first hand-made setup.
if [ ! -L "$LINK" ]; then rm -f "$LINK"; ln -s "$SITE" "$LINK"; fi
if nginx -t; then
  systemctl reload nginx
else
  echo "[install] nginx config rejected; restoring the previous one" >&2
  LAST="$(ls -t /root/nginx-anthonyl.im.bak-* 2>/dev/null | head -1 || true)"
  if [ -n "$LAST" ]; then cp "$LAST" "$SITE"; nginx -t && systemctl reload nginx; fi
  exit 1
fi

echo "[install] server unit + watchdog"
bash "$HERE/install-service.sh"
# No-op when it is already running; a changed unit takes effect on the next
# deploy or `systemctl restart anthonyl.im`.
systemctl start anthonyl.im.service

echo "[install] done"
