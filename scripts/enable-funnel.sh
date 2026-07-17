#!/usr/bin/env bash
# Request Tailscale Funnel for local Vite (HTTP).
# From Jenkins: touch a trigger for the GUI LaunchAgent (required on macOS).
# Direct CLI from Jenkins usually prints "Funnel started" but does NOT persist.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${PORT:-5173}"
BACKEND="${FUNNEL_BACKEND:-http://127.0.0.1:${PORT}}"
FUNNEL_HOST="${FUNNEL_HOST:-agent3s-imac.tail91abbd.ts.net}"
PUBLIC_URL="https://${FUNNEL_HOST}/"
TRIGGER="${ROOT}/.funnel-request"
# Deploy should not fail solely because Funnel isn't up yet (set FUNNEL_REQUIRED=1 to enforce).
FUNNEL_REQUIRED="${FUNNEL_REQUIRED:-0}"

find_tailscale() {
  local app="/Applications/Tailscale.app/Contents/MacOS/Tailscale"
  if [[ -x "$app" ]]; then
    echo "$app"
    return
  fi
  if command -v tailscale >/dev/null 2>&1; then
    command -v tailscale
    return
  fi
  return 1
}

http_code() {
  # Avoid "000000" when curl fails after writing 000 — don't append another 000 via ||.
  local code
  code="$(curl -ksS -o /dev/null -w '%{http_code}' --connect-timeout 5 --max-time 12 "$PUBLIC_URL" 2>/dev/null)" || code="000"
  printf '%s' "$code"
}

public_ok() {
  local code
  code="$(http_code)"
  echo "==> GET ${PUBLIC_URL} → HTTP ${code}"
  [[ "$code" =~ ^[23][0-9][0-9]$ ]]
}

if [[ "${EUID:-$(id -u)}" -eq 0 ]]; then
  echo "ERROR: do not run Funnel as root/sudo." >&2
  exit 1
fi

TS=""
if TS="$(find_tailscale)"; then
  dns="$("$TS" status --json 2>/dev/null | python3 -c "import sys,json; print(json.load(sys.stdin).get('Self',{}).get('DNSName','').rstrip('.'))" 2>/dev/null || true)"
  if [[ -n "${dns}" ]]; then
    FUNNEL_HOST="$dns"
    PUBLIC_URL="https://${FUNNEL_HOST}/"
  fi
fi

echo "==> Funnel as user=$(id -un) HOME=${HOME:-}"
echo "==> waiting for ${BACKEND} (Vite)"
ready=0
for _ in $(seq 1 90); do
  if nc -z 127.0.0.1 "$PORT" 2>/dev/null; then
    ready=1
    break
  fi
  sleep 1
done
if [[ "$ready" -ne 1 ]]; then
  echo "port ${PORT} not up — Funnel not enabled" >&2
  exit 1
fi

# Prefer GUI LaunchAgent (persists Serve config on macOS). Fall back to direct CLI.
if [[ -f "${HOME}/Library/LaunchAgents/com.trueid.office.funnel.plist" ]]; then
  echo "==> triggering GUI LaunchAgent via ${TRIGGER}"
  # Update mtime even if file exists — WatchPaths fires on content/mtime change.
  date >"$TRIGGER"
else
  echo "==> LaunchAgent not installed — trying direct CLI (often ineffective from Jenkins)"
  echo "    One-time fix in desktop Terminal: bash scripts/install-funnel-agent.sh"
  if [[ -n "$TS" ]]; then
    "$TS" funnel --bg --https=443 "$BACKEND" || true
  fi
fi

echo "==> waiting for public URL"
ok=0
for _ in $(seq 1 45); do
  if public_ok; then
    ok=1
    break
  fi
  sleep 2
done

if [[ "$ok" -eq 1 ]]; then
  echo "==> public (no VPN): ${PUBLIC_URL}"
  exit 0
fi

echo "" >&2
echo "WARNING: Funnel URL not reachable yet: ${PUBLIC_URL}" >&2
echo "On agent3 desktop Terminal (once):" >&2
echo "  cd ~/apps/trueid-office && bash scripts/install-funnel-agent.sh && npm run funnel:on" >&2
echo "pm2/app restart still succeeded; guests need Funnel enabled in the GUI session." >&2

if [[ "$FUNNEL_REQUIRED" == "1" ]]; then
  exit 1
fi
exit 0
