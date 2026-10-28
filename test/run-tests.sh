#!/usr/bin/env bash
# Run the anchoring tests in headless Chrome. Usage: test/run-tests.sh
# Exit code 0 when every test passes.
set -euo pipefail
cd "$(dirname "$0")/.."

CHROME="${CHROME:-}"
if [[ -z "$CHROME" ]]; then
  for c in "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" google-chrome chromium chromium-browser; do
    if command -v "$c" >/dev/null 2>&1 || [[ -x "$c" ]]; then CHROME="$c"; break; fi
  done
fi
[[ -n "$CHROME" ]] || { echo "Chrome not found; set CHROME=/path/to/chrome"; exit 2; }

PORT="${PORT:-8799}"
python3 test/serve.py "$PORT" >/dev/null 2>&1 &
SERVER=$!
PROFILE="$(mktemp -d)"
trap 'kill $SERVER 2>/dev/null; rm -rf "$PROFILE"' EXIT
sleep 0.5

OUT="$("$CHROME" --headless=new --disable-gpu --no-first-run --user-data-dir="$PROFILE" \
  --virtual-time-budget=20000 --dump-dom "http://127.0.0.1:$PORT/test/anchoring.test.html" 2>/dev/null)"

# Print the <pre id="results"> block.
RESULTS="$(printf '%s' "$OUT" | python3 -c 'import sys,re,html; m=re.search(r"<pre id=\"results\">(.*?)</pre>", sys.stdin.read(), re.S); print(html.unescape(m.group(1)) if m else "no results")')"
echo "$RESULTS"
[[ "$RESULTS" == PASS* ]]
