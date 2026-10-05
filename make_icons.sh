#!/bin/bash
set -e
cd "$(dirname "$0")"
TMP=$(mktemp -d)
qlmanage -t -s 512 -o "$TMP" favicon.svg >/dev/null 2>&1
SRC="$TMP/favicon.svg.png"
if [ ! -f "$SRC" ]; then
  echo "ICON_FAIL: qlmanage produced no file"
  exit 1
fi
for s in 16 32 48 128; do
  sips -z $s $s "$SRC" --out "extension-icon-$s.png" >/dev/null
done
rm -rf "$TMP"
echo "ICONS_DONE"
