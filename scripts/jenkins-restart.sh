#!/usr/bin/env bash
# Restart TrueID Office under pm2 (called from Jenkins — job can exit; app keeps running).
# Uses npx pm2 (same as Freestyle shell) — no global pm2 required.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> npm ci"
npm ci

PM2=(npx --no-install pm2)

if "${PM2[@]}" describe trueid-office >/dev/null 2>&1; then
  echo "==> pm2 restart trueid-office"
  "${PM2[@]}" restart trueid-office --update-env
else
  echo "==> pm2 start ecosystem.config.cjs"
  # Drop legacy process names from the old Freestyle script if present
  "${PM2[@]}" delete trueid-api trueid-web 2>/dev/null || true
  "${PM2[@]}" start ecosystem.config.cjs
fi

"${PM2[@]}" save
"${PM2[@]}" status trueid-office

echo "==> share URLs"
node scripts/share-info.mjs
