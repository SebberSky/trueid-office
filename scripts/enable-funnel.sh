#!/usr/bin/env bash
# Request Tailscale Funnel for local Vite (HTTP).
# Auto-installs the macOS LaunchAgent, triggers it, verifies public URL.
# Success = public URL returns 2xx/3xx. Otherwise exit 1.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${PORT:-5173}"
BACKEND="${FUNNEL_BACKEND:-http://127.0.0.1:${PORT}}"
FUNNEL_HOST="${FUNNEL_HOST:-agent3s-imac.tail91abbd.ts.net}"
PUBLIC_URL="https://${FUNNEL_HOST}/"
TRIGGER="${ROOT}/.funnel-request"
LABEL="com.trueid.office.funnel"
TS_APP="/usr/local/bin/tailscale"

find_tailscale() {
  # App removed on purpose — use system CLI only (/usr/local/bin/tailscale).
  if [[ -x "$TS_APP" ]]; then
    echo "$TS_APP"
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

as_escape() {
  printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g'
}

run_funnel_direct() {
  local ts="$1"
  echo "==> direct: ${ts} funnel --bg ${PORT}"
  "$ts" funnel --bg "$PORT" || true
}

run_funnel_osascript() {
  local ts="$1"
  if ! command -v osascript >/dev/null 2>&1; then
    return 1
  fi
  local line
  line="$(as_escape "$ts") funnel --bg $(as_escape "$PORT")"
  echo "==> osascript GUI: ${line}"
  osascript -e "do shell script \"${line}\"" || true
}

fail() {
  echo "" >&2
  echo "ERROR: public Funnel not reachable — deploy FAILED." >&2
  echo "URL: ${PUBLIC_URL}" >&2
  echo "LaunchAgent log: ${ROOT}/.funnel-agent.log" >&2
  echo "Bootstrap err:   ${ROOT}/.funnel-agent.bootstrap.err" >&2
  echo "" >&2
  echo "Mac must be logged in as $(id -un) at the desktop (GUI), Tailscale Connected," >&2
  echo "ACL funnel enabled, and Vite on :${PORT}. Re-run Jenkins after that." >&2
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

echo "==> auto-install LaunchAgent"
chmod +x "${ROOT}/scripts/install-funnel-agent.sh" "${ROOT}/scripts/funnel-agent.sh"
bash "${ROOT}/scripts/install-funnel-agent.sh"

uid="$(id -u)"
echo "==> trigger WatchPaths + kickstart"
date >"$TRIGGER"
launchctl kickstart -k "gui/${uid}/${LABEL}" 2>/dev/null || true

# Also run the agent script now (same user) in case WatchPaths is slow/missed
bash "${ROOT}/scripts/funnel-agent.sh" || true

if [[ -n "$TS" ]]; then
  run_funnel_direct "$TS"
  run_funnel_osascript "$TS" || true
fi

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
  fail
fi

echo "==> public OK (no VPN): ${PUBLIC_URL}"
exit 0
