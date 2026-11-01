#!/usr/bin/env bash
cd "$(dirname "${BASH_SOURCE[0]}")"
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is required. On Termux, run: pkg install nodejs-lts" >&2
  exit 1
fi
if ! node -e "['axios', 'express', 'vue'].forEach(name => require.resolve(name))" >/dev/null 2>&1; then
  echo "Installing server dependencies..."
  npm ci --omit=dev || exit 1
fi
command -v termux-wake-lock >/dev/null 2>&1 && termux-wake-lock
export HOST=0.0.0.0 PORT=8899
echo "TV address: http://<this device's LAN IP>:$PORT/"
exec node src/server/index.js
