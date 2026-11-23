#!/usr/bin/env bash
# Restarts the server without refusing or dropping a connection. The deploy
# runs it from the release it has just made live; by hand, as root on the
# droplet:
#
#   bash ~/anthonyl.im/deploy/restart.sh
#
# `systemctl restart anthonyl.im` alone leaves nothing listening on :3000
# between the old process exiting and the new one listening, and nginx answers
# 502 to whatever arrives then. So this first starts a bridge, a second copy
# of the live release in a transient unit that shares the port through
# SO_REUSEPORT (REUSE_PORT=1 in the unit). Then it restarts the unit, waits
# for the new process to listen, and stops the bridge.
#
# reuseport-newest.ts sends every new connection to the newest listener, so
# the old process gets none once the bridge listens, and the bridge none once
# the new process does. A process told to stop stops listening at once and
# finishes the requests it has (index.ts); a connection still queued on a
# closing listener moves to the other one (net.ipv4.tcp_migrate_req, set by
# install-service.sh).
#
# The bridge runs no background workers (Instagram imports, the AI review
# sweep), so two of them never run at once. Each step that fails falls back:
# without the steering, connections are spread over both listeners; without
# a bridge (the running server predates REUSE_PORT, say), this is a plain
# restart.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
UNIT=anthonyl.im.service
BRIDGE=anthonyl.im-bridge.service
PORT=3000

# listener_fd UNIT: the fd of the unit's main process's listening socket on :$PORT.
listener_fd() {
  local pid sockets
  pid=$(systemctl show -P MainPID "$1")
  [ "${pid:-0}" -gt 0 ] || return 1
  sockets=$(ss -Hltnp "sport = :$PORT")
  grep -o -m1 "pid=$pid,fd=[0-9]*" <<<"$sockets" | cut -d= -f3
}

# wait_listening UNIT: up to 20 s, giving up early once the unit has stopped.
# Then a moment for the process it took over from to read what it accepted.
wait_listening() {
  for _ in $(seq 1 80); do
    if listener_fd "$1" >/dev/null; then
      sleep 0.2
      return 0
    fi
    case "$(systemctl is-active "$1")" in inactive | failed) return 1 ;; esac
    sleep 0.25
  done
  return 1
}

stop_bridge() {
  systemctl stop "$BRIDGE" 2>/dev/null || true
}

# One restart at a time: a second run (by hand, during a deploy) would stop
# this one's bridge. Held until exit, so the EXIT trap runs under it.
exec 9>/run/anthonyl.im-restart.lock
if ! flock -w 60 9; then
  echo "[restart] another restart has held the lock for 60 s; giving up"
  exit 1
fi

# A bridge left by an interrupted run would serve its release beside this one.
stop_bridge
trap stop_bridge EXIT

bridged=0
if systemctl is-active --quiet "$UNIT" && command -v ss >/dev/null; then
  # The unit's directory, environment and command, with the workers off. The
  # environment wins over .env: Bun never overrides a variable already set.
  cmd=$(systemctl show -P ExecStart "$UNIT" | sed -n 's/.*argv\[\]=\(.*\) ; ignore_errors=.*/\1/p')
  bun="${cmd%% *}"

  # Attached on every run: a plain restart empties the group and the program
  # goes with it. It fails on a server without REUSE_PORT, which has no group.
  pid=$(systemctl show -P MainPID "$UNIT")
  if ! { fd=$(listener_fd "$UNIT") && timeout 10 "$bun" "$HERE/reuseport-newest.ts" "$pid" "$fd"; }; then
    echo "[restart] could not steer new connections; the listeners will share them"
  fi

  # RuntimeMaxSec stops the bridge even if this script dies before its trap.
  # shellcheck disable=SC2086 # $cmd is the unit's argv, split on purpose
  if systemd-run --quiet --collect --unit="$BRIDGE" \
    --description="anthonyl.im bridge while the server restarts" \
    -p WorkingDirectory="$(systemctl show -P WorkingDirectory "$UNIT")" \
    -p Environment="$(systemctl show -P Environment "$UNIT")" \
    -E IG_WORKER_ENABLED=false -E TRIPS_REVIEW_WORKER=false \
    -p LimitNOFILE=65536 -p TimeoutStopSec=10 -p RuntimeMaxSec=120 -p MemoryMax=300M \
    -p SyslogIdentifier=anthonyl.im-bridge \
    $cmd && wait_listening "$BRIDGE"; then
    bridged=1
  else
    echo "[restart] the bridge did not come up; restarting without one"
    stop_bridge
  fi
fi

systemctl restart "$UNIT"
if [ "$bridged" = 1 ]; then
  if ! wait_listening "$UNIT"; then
    echo "[restart] $UNIT is not listening on :$PORT after 20 s"
    exit 1
  fi
  echo "[restart] restarted behind a bridge"
fi
