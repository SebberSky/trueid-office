#!/usr/bin/env bash
# Request Tailscale Funnel for local Vite (HTTP).
# Success = public URL returns 2xx/3xx. Otherwise exit 1 (Jenkins build fails).
# On macOS, Jenkins must trigger the GUI LaunchAgent — direct CLI does not persist.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${PORT:-5173}"
BACKEND="${FUNNEL_BACKEND:-http://127.0.0.1:${PORT}}"
FUNNEL_HOST="${FUNNEL_HOST:-agent3s-imac.tail91abbd.ts.net}"
PUBLIC_URL="https://${FUNNEL_HOST}/"
TRIGGER="${ROOT}/.funnel-request"
AGENT_PLIST="${HOME}/Library/LaunchAgents/com.trueid.office.funnel.plist"

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

fail() {
  echo "" >&2
  echo "ERROR: public Funnel not reachable — deploy FAILED." >&2
  echo "URL: ${PUBLIC_URL}" >&2
  echo "" >&2
  echo "On agent3 desktop Terminal (GUI session), run once:" >&2
  echo "  cd ~/apps/trueid-office" >&2
  echo "  bash scripts/install-funnel-agent.sh" >&2
  echo "  npm run funnel:on" >&2
  echo "Then confirm the URL opens without Tailscale VPN, and re-run Jenkins." >&2
  exit 1
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
  echo "ERROR: port ${PORT} not up (Vite/pm2)." >&2
  exit 1
fi

if [[ ! -f "$AGENT_PLIST" ]]; then
  echo "ERROR: Funnel LaunchAgent not installed (${AGENT_PLIST})." >&2
  echo "Direct \`tailscale funnel\` from Jenkins prints success but does NOT work (HTTP 000)." >&2
  fail
fi

echo "==> triggering GUI LaunchAgent via ${TRIGGER}"
date >"$TRIGGER"

echo "==> waiting for public URL (must be 2xx/3xx)"
ok=0
for _ in $(seq 1 45); do
  if public_ok; then
    ok=1
    break
  fi
  sleep 2
done

if [[ "$ok" -ne 1 ]]; then
  echo "ERROR: still HTTP 000 / non-2xx after LaunchAgent trigger." >&2
  echo "Check log: ${ROOT}/.funnel-agent.log" >&2
  fail
fi

echo "==> public OK (no VPN): ${PUBLIC_URL}"
exit 0
