#!/usr/bin/env bash
# Build the Chrome Web Store upload zip: dist/rememberremember-<version>.zip
# Only runtime files go in; tests, docs and store assets stay out.
set -euo pipefail
cd "$(dirname "$0")/.."

VERSION="$(python3 -c 'import json; print(json.load(open("manifest.json"))["version"])')"
OUT="dist/rememberremember-$VERSION.zip"
FILES=(manifest.json background.js content.js content.css shared.js ui.js ui.css
       sidepanel.html sidepanel.js sidepanel.css library.html library.js library.css
       icons/icon16.png icons/icon32.png icons/icon48.png icons/icon128.png)

for f in "${FILES[@]}"; do [[ -f "$f" ]] || { echo "missing $f"; exit 1; }; done
for f in *.js; do node --check "$f"; done

mkdir -p dist
rm -f "$OUT"
zip -q -X "$OUT" "${FILES[@]}"
echo "Built $OUT ($(du -h "$OUT" | cut -f1)), version $VERSION"
unzip -l "$OUT" | tail -n +4 | sed '$d' | sed '$d' | awk '{print "  " $4}'
