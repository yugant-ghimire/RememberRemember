#!/usr/bin/env bash
# Render Chrome Web Store images into store/ with headless Chrome:
#   5 screenshots at 1280x800 and the 440x280 small promo tile.
set -euo pipefail
cd "$(dirname "$0")/.."

CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
PORT="${PORT:-8798}"
python3 test/serve.py "$PORT" >/dev/null 2>&1 &
SERVER=$!
trap 'kill $SERVER 2>/dev/null' EXIT
sleep 0.5

shot() { # name url width height [scheme]
  local profile; profile="$(mktemp -d)"
  # preferredColorScheme: 0 = dark, 1 = light (independent of the OS setting)
  local scheme=1; [[ "${5:-light}" == dark ]] && scheme=0
  "$CHROME" --headless=new --disable-gpu --no-first-run --hide-scrollbars --user-data-dir="$profile" \
    --force-device-scale-factor=1 --window-size="$3,$4" --virtual-time-budget=8000 \
    --run-all-compositor-stages-before-draw --blink-settings=preferredColorScheme=$scheme \
    --screenshot="store/$1.png" "http://127.0.0.1:$PORT/$2" >/dev/null 2>&1
  rm -rf "$profile"
  echo "store/$1.png"
}

shot screenshot-1-highlight "test/article.html#scene-toolbar" 1280 800
shot screenshot-2-notes     "test/article.html#scene-note" 1280 800
shot screenshot-3-panel     "test/article.html#scene-panel" 1280 800
shot screenshot-4-library   "test/workbench.html?page=library.html#scene-library" 1280 800
shot screenshot-5-dark      "test/article.html#scene-dark" 1280 800 dark
shot promo-small-440x280    "store/promo.html" 440 280
