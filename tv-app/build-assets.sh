#!/usr/bin/env bash
# Transpiles the web client for the TV's Chrome 66 WebView and bundles the shell's shims into it.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
mkdir -p tv-app/app/src/main/assets
npx --yes esbuild@0.24.0 src/client/js/app.js --target=chrome66 \
  --banner:js="$(cat tv-app/legacy-banner.js tv-app/tv-player.js)" \
  --outfile=tv-app/app/src/main/assets/app.js
npx --yes esbuild@0.24.0 src/client/css/app.css --target=chrome66 --outfile=tv-app/app/src/main/assets/app.css
node tv-app/transform-css.js tv-app/app/src/main/assets/app.css
