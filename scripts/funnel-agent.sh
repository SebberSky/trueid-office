#!/usr/bin/env bash
# Runs Tailscale Funnel in the logged-in macOS GUI session (LaunchAgent).
# Invoked when Jenkins touches .funnel-request — do not call sudo.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOG="${ROOT}/.funnel-agent.log"
PORT="${PORT:-5173}"
BACKEND="${FUNNEL_BACKEND:-http://127.0.0.1:${PORT}}"
TS="/Applications/Tailscale.app/Contents/MacOS/Tailscale"

{
  echo "---- $(date -Iseconds 2>/dev/null || date) ----"
  echo "user=$(id -un) backend=${BACKEND}"
  if [[ ! -x "$TS" ]]; then
    echo "Tailscale.app CLI missing: ${TS}"
    exit 1
  fi
  # Wait briefly for Vite after pm2 restart
  for _ in $(seq 1 60); do
    if nc -z 127.0.0.1 "$PORT" 2>/dev/null; then
      break
    fi
    sleep 1
  done
  "$TS" funnel --bg --https=443 "$BACKEND" || true
  "$TS" funnel status || true
  "$TS" serve status || true
} >>"$LOG" 2>&1
