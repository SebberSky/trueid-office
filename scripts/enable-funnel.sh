#!/usr/bin/env bash
# Point Tailscale Funnel at local Vite (HTTP). Idempotent — safe after pm2 restart.
# Do NOT use sudo on macOS (serve config will not persist).
set -euo pipefail

PORT="${PORT:-5173}"
BACKEND="${FUNNEL_BACKEND:-http://127.0.0.1:${PORT}}"
FUNNEL_HOST="${FUNNEL_HOST:-agent3s-imac.tail91abbd.ts.net}"
PUBLIC_URL="https://${FUNNEL_HOST}/"

find_tailscale() {
  # Prefer the Mac app CLI — Homebrew/other binaries often can't talk to the GUI session.
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

# Escape a string for embedding inside double-quoted AppleScript.
as_escape() {
  printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g'
}

# macOS Jenkins/launchd often isn't in the Aqua GUI session — XPC to Tailscale.app
# then prints "started" but Serve config never sticks ("No serve config").
run_in_gui() {
  if ! command -v osascript >/dev/null 2>&1; then
    return 1
  fi
  local shell_line=""
  local c
  for c in "$@"; do
    shell_line+="$(as_escape "$c")"
    shell_line+=" "
  done
  echo "==> retry via osascript (GUI session)"
  osascript -e "do shell script \"${shell_line}\""
}

public_ok() {
  local code
  code="$(curl -ksS -o /dev/null -w '%{http_code}' --connect-timeout 8 --max-time 15 "$PUBLIC_URL" 2>/dev/null || echo 000)"
  echo "==> GET ${PUBLIC_URL} → HTTP ${code}"
  [[ "$code" =~ ^[23][0-9][0-9]$ ]]
}

enable_funnel() {
  echo "==> ${TS} funnel --bg --https=443 ${BACKEND}"
  "$TS" funnel --bg --https=443 "$BACKEND" || true
  sleep 2
  if public_ok; then
    return 0
  fi
  run_in_gui "$TS" funnel --bg --https=443 "$BACKEND" || true
  sleep 2
  public_ok
}

if [[ "${EUID:-$(id -u)}" -eq 0 ]]; then
  echo "ERROR: do not run Funnel as root/sudo — config will not stick (No serve config)." >&2
  exit 1
fi

if ! TS="$(find_tailscale)"; then
  echo "tailscale CLI not found — skip Funnel" >&2
  exit 0
fi

echo "==> Funnel as user=$(id -un) HOME=${HOME:-} TS=${TS}"

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

dns="$("$TS" status --json 2>/dev/null | python3 -c "import sys,json; print(json.load(sys.stdin).get('Self',{}).get('DNSName','').rstrip('.'))" 2>/dev/null || true)"
if [[ -n "${dns}" ]]; then
  FUNNEL_HOST="$dns"
  PUBLIC_URL="https://${FUNNEL_HOST}/"
fi

echo "==> enable Funnel → ${BACKEND}"
# Do not use `serve reset` (can leave empty state on macOS).
# Do not use `funnel ... on` — newer CLI treats "on" as proxy URL ("http://on").
if ! enable_funnel; then
  echo "" >&2
  echo "ERROR: Funnel public URL not reachable: ${PUBLIC_URL}" >&2
  echo "Jenkins may be outside the macOS GUI session, so Tailscale Serve never sticks." >&2
  echo "Run once in desktop Terminal as $(id -un):" >&2
  echo "  cd ~/apps/trueid-office && npm run funnel:on" >&2
  echo "" >&2
  echo "CLI status (informational — often wrong from Jenkins):" >&2
  "$TS" serve status 2>&1 || true
  "$TS" funnel status 2>&1 || true
  exit 1
fi

echo "==> serve/funnel status (informational)"
"$TS" serve status 2>&1 || true
"$TS" funnel status 2>&1 || true

echo "==> public (no VPN): ${PUBLIC_URL}"
