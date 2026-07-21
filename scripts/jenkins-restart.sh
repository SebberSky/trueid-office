#!/usr/bin/env bash
# Restart TrueID Office under pm2 (called from Jenkins — job can exit; app keeps running).
# Uses npx pm2 (same as Freestyle shell) — no global pm2 required.
#
# IMPORTANT: always delete + start from THIS checkout. A plain `pm2 restart` keeps the
# original cwd from the first start, so Jenkins workspace updates never go live.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> checkout root: $ROOT"
echo "==> npm ci"
npm ci

PM2=(npx --no-install pm2)

echo "==> pm2 delete trueid-office (and legacy names) then start from this checkout"
"${PM2[@]}" delete trueid-office trueid-api trueid-web 2>/dev/null || true
"${PM2[@]}" start ecosystem.config.cjs

"${PM2[@]}" save
"${PM2[@]}" status trueid-office

echo "==> share URLs"
node scripts/share-info.mjs

echo "==> health build tag (expect xo-http-20260721 after this PR)"
curl -sS -m 3 http://127.0.0.1:3001/api/health || echo "(health not ready yet)"
