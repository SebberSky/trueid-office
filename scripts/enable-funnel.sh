#!/usr/bin/env bash
# Point Tailscale Funnel at local Vite (HTTP). Idempotent — safe after pm2 restart.
# Do NOT use sudo on macOS (serve config will not persist).
set -euo pipefail

PORT="${PORT:-5173}"
BACKEND="${FUNNEL_BACKEND:-http://127.0.0.1:${PORT}}"

find_tailscale() {
  if command -v tailscale >/dev/null 2>&1; then
    command -v tailscale
    return
  fi
  local app="/Applications/Tailscale.app/Contents/MacOS/Tailscale"
  if [[ -x "$app" ]]; then
    echo "$app"
    return
  fi
  return 1
}

if ! TS="$(find_tailscale)"; then
  echo "tailscale CLI not found — skip Funnel" >&2
  exit 0
fi

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

echo "==> tailscale funnel → ${BACKEND}"
# reset avoids stale https+insecure / old port configs
"$TS" serve reset >/dev/null 2>&1 || true
"$TS" funnel --bg --https=443 "$BACKEND"
"$TS" funnel status || true

dns="$("$TS" status --json 2>/dev/null | python3 -c "import sys,json; print(json.load(sys.stdin).get('Self',{}).get('DNSName','').rstrip('.'))" 2>/dev/null || true)"
if [[ -n "${dns}" ]]; then
  echo "==> public (no VPN): https://${dns}/"
else
  echo "==> public (no VPN): https://agent3s-imac.tail91abbd.ts.net/"
fi
