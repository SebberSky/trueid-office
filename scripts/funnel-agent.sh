#!/usr/bin/env bash
# Runs Tailscale Funnel in the logged-in macOS GUI session (LaunchAgent).
# Invoked when Jenkins touches .funnel-request — do not call sudo.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOG="${ROOT}/.funnel-agent.log"
PORT="${PORT:-5173}"

find_ts() {
  # App removed on purpose — system CLI only.
  if [[ -x /usr/local/bin/tailscale ]]; then
    echo /usr/local/bin/tailscale
    return
  fi
  command -v tailscale
}

{
  echo "---- $(date -Iseconds 2>/dev/null || date) ----"
  echo "user=$(id -un) port=${PORT}"
  if ! TS="$(find_ts)"; then
    echo "tailscale CLI not found at /usr/local/bin/tailscale"
    exit 1
  fi
  echo "ts=${TS}"
  for _ in $(seq 1 60); do
    if nc -z 127.0.0.1 "$PORT" 2>/dev/null; then
      break
    fi
    sleep 1
  done
  "$TS" funnel --bg "$PORT" || true
  "$TS" funnel status || true
  "$TS" serve status || true
} >>"$LOG" 2>&1
