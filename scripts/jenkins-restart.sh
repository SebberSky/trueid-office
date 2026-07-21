#!/usr/bin/env bash
# Restart TrueID Office under pm2 (called from Jenkins — job can exit; app keeps running).
# Uses npx pm2 (same as Freestyle shell) — no global pm2 required.
#
# Jenkins checkouts live under an ephemeral workspace. Funnel always points at the
# long-lived host clone — never pm2-start from the Jenkins workspace or you get 502.
set -euo pipefail

SCRIPT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# Permanent host clone (override with TRUEID_OFFICE_DIR if the path differs).
DEPLOY_DIR="${TRUEID_OFFICE_DIR:-/Users/guyrocker/git/trueid_office/trueid-office}"

if [[ "$SCRIPT_ROOT" == *"/workspace/"* || "$SCRIPT_ROOT" == *"jenkins"* || "$SCRIPT_ROOT" == *"Jenkins"* ]]; then
  APP_DIR="$DEPLOY_DIR"
  echo "==> Jenkins workspace detected ($SCRIPT_ROOT)"
  echo "==> syncing permanent deploy dir: $APP_DIR"
  if [[ ! -d "$APP_DIR/.git" ]]; then
    echo "ERROR: permanent deploy dir missing: $APP_DIR" >&2
    exit 1
  fi
  git -C "$APP_DIR" fetch origin
  git -C "$APP_DIR" checkout -B main origin/main
  git -C "$APP_DIR" reset --hard origin/main
else
  APP_DIR="$SCRIPT_ROOT"
  echo "==> manual/host restart from: $APP_DIR"
fi

cd "$APP_DIR"

echo "==> npm ci"
npm ci

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
