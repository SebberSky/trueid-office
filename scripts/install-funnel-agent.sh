#!/usr/bin/env bash
# Install a per-user LaunchAgent that enables Funnel inside the Aqua GUI session.
# Run ONCE in desktop Terminal on agent3:  bash scripts/install-funnel-agent.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LABEL="com.trueid.office.funnel"
PLIST="${HOME}/Library/LaunchAgents/${LABEL}.plist"
TRIGGER="${ROOT}/.funnel-request"
AGENT="${ROOT}/scripts/funnel-agent.sh"

chmod +x "$AGENT" "${ROOT}/scripts/enable-funnel.sh"
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
  <false/>
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
launchctl bootout "gui/${uid}/${LABEL}" 2>/dev/null || true
launchctl bootstrap "gui/${uid}" "$PLIST"
launchctl enable "gui/${uid}/${LABEL}" 2>/dev/null || true

echo "Installed LaunchAgent: ${PLIST}"
echo "Trigger file: ${TRIGGER}"
echo "Test: touch \"${TRIGGER}\" && sleep 3 && tail -20 \"${ROOT}/.funnel-agent.log\""
echo "Then open: https://agent3s-imac.tail91abbd.ts.net/"
