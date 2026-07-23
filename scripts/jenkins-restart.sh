#!/usr/bin/env bash
# Restart TrueID Office under pm2 (called from Jenkins — job can exit; app keeps running).
# Host app lives under ~/apps/ (default ~/apps/trueid-office). Override with TRUEID_OFFICE_DIR.
set -euo pipefail

SCRIPT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

resolve_deploy_dir() {
  if [[ -n "${TRUEID_OFFICE_DIR:-}" ]]; then
    echo "$TRUEID_OFFICE_DIR"
    return
  fi
  local preferred="$HOME/apps/trueid-office"
  if [[ -d "$preferred/.git" ]]; then
    echo "$preferred"
    return
  fi
  # Fallback: sole git checkout under ~/apps
  if [[ -d "$HOME/apps" ]]; then
    local matches=()
    local d
    for d in "$HOME/apps"/*; do
      [[ -d "$d/.git" ]] || continue
      matches+=("$d")
    done
    if [[ ${#matches[@]} -eq 1 ]]; then
      echo "${matches[0]}"
      return
    fi
  fi
  echo "$preferred"
}

DEPLOY_DIR="$(resolve_deploy_dir)"

if [[ "$SCRIPT_ROOT" == *"/workspace/"* || "$SCRIPT_ROOT" == *"jenkins"* || "$SCRIPT_ROOT" == *"Jenkins"* ]]; then
  APP_DIR="$DEPLOY_DIR"
  echo "==> Jenkins workspace detected ($SCRIPT_ROOT)"
  echo "==> syncing permanent deploy dir: $APP_DIR"
  if [[ ! -d "$APP_DIR/.git" ]]; then
    echo "ERROR: permanent deploy dir missing: $APP_DIR" >&2
    echo "Expected ~/apps/trueid-office (or set TRUEID_OFFICE_DIR)." >&2
    ls -la "$HOME/apps" 2>&1 || true
    exit 1
  fi
  git -C "$APP_DIR" fetch origin
  git -C "$APP_DIR" checkout -B main origin/main
  git -C "$APP_DIR" reset --hard origin/main
else
  # Manual run: if we're already inside ~/apps/..., use that; else prefer deploy dir when present.
  if [[ "$SCRIPT_ROOT" == *"/apps/"* ]]; then
    APP_DIR="$SCRIPT_ROOT"
  elif [[ -d "$DEPLOY_DIR/.git" ]]; then
    APP_DIR="$DEPLOY_DIR"
  else
    APP_DIR="$SCRIPT_ROOT"
  fi
  echo "==> manual restart from: $APP_DIR"
fi

cd "$APP_DIR"

echo "==> npm ci"
npm ci

WARN_SEC="${TRUEID_UPDATE_WARN_SEC:-10}"
echo "==> notifying online clients (client refresh wait ${WARN_SEC}s)…"
if curl -sf -m 3 -X POST "http://127.0.0.1:3001/api/server-updating" \
  -H 'Content-Type: application/json' \
  -d "{\"inSec\":${WARN_SEC}}"; then
  echo
else
  echo
  echo "WARN: could not notify clients (server may be down) — continuing restart" >&2
fi

PM2=(npx --no-install pm2)

echo "==> pm2 delete trueid-office (and legacy names) then start from $APP_DIR"
"${PM2[@]}" delete trueid-office trueid-api trueid-web 2>/dev/null || true
"${PM2[@]}" start "$APP_DIR/ecosystem.config.cjs"

"${PM2[@]}" save
"${PM2[@]}" status trueid-office

echo "==> waiting for API health..."
ok=0
for _ in 1 2 3 4 5 6 7 8 9 10; do
  if curl -sf -m 2 http://127.0.0.1:3001/api/health >/tmp/trueid-health.json 2>/dev/null; then
    echo "==> health:"
    cat /tmp/trueid-health.json
    echo
    ok=1
    break
  fi
  sleep 2
done
if [[ "$ok" -ne 1 ]]; then
  echo "ERROR: /api/health did not come up on :3001" >&2
  "${PM2[@]}" logs trueid-office --lines 40 --nostream || true
  exit 1
fi

echo "==> share URLs"
node scripts/share-info.mjs
