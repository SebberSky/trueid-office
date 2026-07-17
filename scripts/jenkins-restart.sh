#!/usr/bin/env bash
# Restart TrueID Office under pm2 (called from Jenkins — job can exit; app keeps running).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if ! command -v pm2 >/dev/null 2>&1; then
  echo "pm2 not found — install on the Jenkins agent: npm i -g pm2" >&2
  exit 1
fi

echo "==> npm ci"
npm ci

if pm2 describe trueid-office >/dev/null 2>&1; then
  echo "==> pm2 restart trueid-office"
  pm2 restart trueid-office --update-env
else
  echo "==> pm2 start ecosystem.config.cjs"
  pm2 start ecosystem.config.cjs
fi

pm2 save
pm2 status trueid-office
echo "==> guests: https://100.67.207.114:5173/"
echo "==> host:   https://localhost:5173/"
