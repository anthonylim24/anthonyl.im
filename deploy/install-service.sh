#!/usr/bin/env bash
# Installs the server's systemd unit and the health watchdog from this
# checkout. On a droplet that still runs the server under PM2, it also stops
# and disables PM2 so the unit owns port 3000.
#
# It does not start or restart the server: the deploy restarts it right
# after, and install-droplet.sh starts it when it is not running. Every
# deploy runs this from the release it is about to start; it is safe to run
# again. As root on the droplet:
#
#   bash deploy/install-service.sh
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
UNITS=/etc/systemd/system
changed=0

# Copy only what differs, so an unchanged deploy skips the daemon-reload.
put() {
  local mode="$1" src="$2" dst="$3"
  if ! cmp -s "$src" "$dst"; then
    install -m "$mode" "$src" "$dst"
    echo "[service] updated $dst"
    changed=1
  fi
}

put 644 "$HERE/systemd/anthonyl.im.service" "$UNITS/anthonyl.im.service"
put 755 "$HERE/watchdog/anthonyl-watchdog.sh" /usr/local/bin/anthonyl-watchdog.sh
put 644 "$HERE/watchdog/anthonyl-watchdog.service" "$UNITS/anthonyl-watchdog.service"
put 644 "$HERE/watchdog/anthonyl-watchdog.timer" "$UNITS/anthonyl-watchdog.timer"
if [ "$changed" = 1 ]; then
  systemctl daemon-reload
fi
systemctl enable --quiet anthonyl.im.service
systemctl enable --quiet --now anthonyl-watchdog.timer

# Hand-over from PM2, once. Stopping pm2-root stops PM2's copy of the server
# and the daemon; disabling it keeps a reboot from starting a second copy on
# :3000. PM2's saved process list (~/.pm2/dump.pm2) is left as it is, so
#   systemctl disable --now anthonyl.im && systemctl enable --now pm2-root
# puts the old setup back.
if systemctl is-enabled --quiet pm2-root.service 2>/dev/null \
  || systemctl is-active --quiet pm2-root.service 2>/dev/null; then
  echo "[service] handing the server over from PM2"
  systemctl disable --now pm2-root.service
fi
