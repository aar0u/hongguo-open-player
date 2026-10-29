#!/usr/bin/env bash
cd "$(dirname "${BASH_SOURCE[0]}")"
command -v termux-wake-lock >/dev/null 2>&1 && termux-wake-lock
export HOST=0.0.0.0 PORT=8899
echo "TV address: http://<this device's LAN IP>:$PORT/"
exec node src/server/index.js
