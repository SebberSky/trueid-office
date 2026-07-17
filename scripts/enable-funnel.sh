#!/usr/bin/env bash
# Point Tailscale Funnel at local Vite (HTTP). Idempotent — safe after pm2 restart.
# Do NOT use sudo on macOS (serve config will not persist / shows "No serve config").
set -euo pipefail

PORT="${PORT:-5173}"
BACKEND="${FUNNEL_BACKEND:-http://127.0.0.1:${PORT}}"

find_tailscale() {
  # Prefer the Mac app CLI — Homebrew/other binaries often can't write Serve/Funnel config
  # for the logged-in Tailscale session (status then shows "No serve config").
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

has_serve_config() {
  local out
  out="$("$TS" serve status 2>&1 || true)"
  if echo "$out" | grep -qi 'No serve config'; then
    return 1
  fi
  if echo "$out" | grep -Eq 'https://|proxy |http://|Funnel on'; then
    return 0
  fi
  # JSON path (newer CLI)
  local json
  json="$("$TS" serve status --json 2>/dev/null || true)"
  if [[ -n "$json" && "$json" != "null" && "$json" != "{}" ]]; then
    echo "$json" | python3 -c "import sys,json; d=json.load(sys.stdin); sys.exit(0 if d else 1)" 2>/dev/null
    return $?
  fi
  return 1
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

echo "==> reset + enable serve/funnel → ${BACKEND}"
"$TS" serve reset >/dev/null 2>&1 || true

# Two-step is more reliable on macOS than funnel-with-proxy in one shot
set +e
serve_out="$("$TS" serve --bg --https=443 "$BACKEND" 2>&1)"
serve_rc=$?
echo "$serve_out"
funnel_out="$("$TS" funnel --bg --https=443 on 2>&1)"
funnel_rc=$?
echo "$funnel_out"
set -e

# Fallback: single-shot funnel proxy
if ! has_serve_config; then
  echo "==> retry: funnel --bg proxy"
  "$TS" serve reset >/dev/null 2>&1 || true
  "$TS" funnel --bg --https=443 "$BACKEND" || true
fi

echo "==> serve status"
"$TS" serve status || true
echo "==> funnel status"
"$TS" funnel status || true

if ! has_serve_config; then
  echo "" >&2
  echo "ERROR: Still No serve config after enabling Funnel." >&2
  echo "Jenkins must run as the same macOS user that is logged into the Tailscale app" >&2
  echo "(not root). On agent3, open Terminal as that user and run: npm run funnel:on" >&2
  echo "serve_rc=${serve_rc:-?} funnel_rc=${funnel_rc:-?}" >&2
  exit 1
fi

dns="$("$TS" status --json 2>/dev/null | python3 -c "import sys,json; print(json.load(sys.stdin).get('Self',{}).get('DNSName','').rstrip('.'))" 2>/dev/null || true)"
if [[ -n "${dns}" ]]; then
  echo "==> public (no VPN): https://${dns}/"
else
  echo "==> public (no VPN): https://agent3s-imac.tail91abbd.ts.net/"
fi
