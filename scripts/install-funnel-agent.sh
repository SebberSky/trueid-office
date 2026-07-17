#!/usr/bin/env bash
# Install/refresh per-user LaunchAgent that enables Funnel in the Aqua GUI session.
# Idempotent — safe to call from Jenkins every deploy.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LABEL="com.trueid.office.funnel"
PLIST="${HOME}/Library/LaunchAgents/${LABEL}.plist"
TRIGGER="${ROOT}/.funnel-request"
AGENT="${ROOT}/scripts/funnel-agent.sh"

chmod +x "$AGENT" "${ROOT}/scripts/enable-funnel.sh" "${ROOT}/scripts/install-funnel-agent.sh"
mkdir -p "${HOME}/Library/LaunchAgents"
touch "$TRIGGER"

cat >"$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>${AGENT}</string>
  </array>
  <key>WatchPaths</key>
  <array>
    <string>${TRIGGER}</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>WorkingDirectory</key>
  <string>${ROOT}</string>
  <key>StandardOutPath</key>
  <string>${ROOT}/.funnel-agent.out</string>
  <key>StandardErrorPath</key>
  <string>${ROOT}/.funnel-agent.err</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin</string>
    <key>HOME</key>
    <string>${HOME}</string>
  </dict>
</dict>
</plist>
EOF

uid="$(id -u)"
domain="gui/${uid}"

echo "==> installing LaunchAgent ${LABEL} for ${domain}"
launchctl bootout "${domain}/${LABEL}" 2>/dev/null || true
if ! launchctl bootstrap "$domain" "$PLIST" 2>"${ROOT}/.funnel-agent.bootstrap.err"; then
  echo "WARNING: launchctl bootstrap failed (is ${USER} logged into the Mac GUI?)" >&2
  cat "${ROOT}/.funnel-agent.bootstrap.err" >&2 || true
else
  launchctl enable "${domain}/${LABEL}" 2>/dev/null || true
  launchctl kickstart -k "${domain}/${LABEL}" 2>/dev/null || true
  echo "Installed + kickstarted: ${PLIST}"
fi
