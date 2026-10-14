#!/bin/bash
set -e
cd "$(dirname "$0")"

# 查找系统可用的 Chromium 内核浏览器用于无损矢量栅格化（支持透明背景）
CHROME_BIN=""
CANDIDATES=(
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"
  "/Applications/Chromium.app/Contents/MacOS/Chromium"
  "google-chrome"
  "chromium"
  "microsoft-edge"
)

for bin in "${CANDIDATES[@]}"; do
  if [ -x "$bin" ] || command -v "$bin" >/dev/null 2>&1; then
    CHROME_BIN="$bin"
    break
  fi
done

if [ -z "$CHROME_BIN" ]; then
  echo "❌ 未检测到 Chrome 或 Edge 浏览器，无法进行透明通道渲染"
  exit 1
fi

TMP_DIR=$(mktemp -d)
HTML_FILE="$TMP_DIR/render.html"
MASTER_PNG="$TMP_DIR/master_512.png"

cat <<EOF > "$HTML_FILE"
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { background: transparent; overflow: hidden; width: 512px; height: 512px; }
  img { width: 512px; height: 512px; display: block; border: none; }
</style>
</head>
<body>
  <img src="file://$(pwd)/favicon.svg" />
</body>
</html>
EOF

"$CHROME_BIN" \
  --headless=new \
  --default-background-color=00000000 \
  --screenshot="$MASTER_PNG" \
  --window-size=512,512 \
  "file://$HTML_FILE" >/dev/null 2>&1

if [ ! -f "$MASTER_PNG" ]; then
  echo "❌ 渲染母版 PNG 失败"
  rm -rf "$TMP_DIR"
  exit 1
fi

# 使用 Python Pillow 进行高质量 Lanczos 抗锯齿下采样，保证 Alpha 透明通道完整
python3 - <<EOF
from PIL import Image

master = Image.open("$MASTER_PNG").convert("RGBA")
for s in [16, 32, 48, 128]:
    resized = master.resize((s, s), Image.Resampling.LANCZOS)
    resized.save(f"extension-icon-{s}.png", format="PNG")
print("✅ 已成功生成 16px / 32px / 48px / 128px 透明圆角图标")
EOF

rm -rf "$TMP_DIR"
