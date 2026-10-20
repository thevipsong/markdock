#!/usr/bin/env python3
"""
Captures fresh, unclipped, 100% current-version 1280x800 screenshots
and 440x280 / 1400x560 promo tiles directly from Google Chrome headless.
"""
import os
import subprocess
import time
from PIL import Image

SERVER_URL = "http://127.0.0.1:8765"
SCREENSHOTS_DIR = "store_assets/screenshots"
PROMO_DIR = "store_assets/promo"

os.makedirs(SCREENSHOTS_DIR, exist_ok=True)
os.makedirs(PROMO_DIR, exist_ok=True)

CHROME_BIN = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

def capture(html_content, out_png, delay_ms=1000):
    tmp_file = "tmp_capture.html"
    with open(tmp_file, "w", encoding="utf-8") as f:
        f.write(html_content)

    cmd = [
        CHROME_BIN,
        "--headless=new",
        "--disable-gpu",
        "--window-size=1280,800",
        f"--virtual-time-budget={delay_ms}",
        f"--screenshot={out_png}",
        f"{SERVER_URL}/{tmp_file}"
    ]
    subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
    if os.path.exists(tmp_file):
        os.remove(tmp_file)
    print(f"✓ Captured {out_png}: {os.path.getsize(out_png)} bytes")

# 1. Hero Dark
html_dark = """<!DOCTYPE html>
<html>
<head><style>body,html{margin:0;padding:0;width:1280px;height:800px;overflow:hidden;}iframe{width:1280px;height:800px;border:none;}</style></head>
<body>
<iframe id="f" src="index.html"></iframe>
<script>
document.getElementById("f").onload = () => {
  const win = document.getElementById("f").contentWindow;
  const doc = document.getElementById("f").contentDocument;
  doc.documentElement.dataset.theme = "dark";
  doc.documentElement.dataset.themeMode = "dark";
  const b = doc.getElementById("demoBanner");
  if (b) b.remove();
  const consent = doc.getElementById("dataUseDisclosureDialog");
  if (consent) consent.close();
};
</script>
</body>
</html>"""
capture(html_dark, f"{SCREENSHOTS_DIR}/01_hero_dark.png")

# 2. Hero Light
html_light = """<!DOCTYPE html>
<html>
<head><style>body,html{margin:0;padding:0;width:1280px;height:800px;overflow:hidden;}iframe{width:1280px;height:800px;border:none;}</style></head>
<body>
<iframe id="f" src="index.html"></iframe>
<script>
document.getElementById("f").onload = () => {
  const win = document.getElementById("f").contentWindow;
  const doc = document.getElementById("f").contentDocument;
  doc.documentElement.dataset.theme = "light";
  doc.documentElement.dataset.themeMode = "light";
  doc.documentElement.dataset.skin = "ivory";
  const b = doc.getElementById("demoBanner");
  if (b) b.remove();
  const consent = doc.getElementById("dataUseDisclosureDialog");
  if (consent) consent.close();
};
</script>
</body>
</html>"""
capture(html_light, f"{SCREENSHOTS_DIR}/02_hero_light.png")

# 3. Dock Flyout
html_dock = """<!DOCTYPE html>
<html>
<head><style>body,html{margin:0;padding:0;width:1280px;height:800px;overflow:hidden;}iframe{width:1280px;height:800px;border:none;}</style></head>
<body>
<iframe id="f" src="index.html"></iframe>
<script>
document.getElementById("f").onload = () => {
  const win = document.getElementById("f").contentWindow;
  const doc = document.getElementById("f").contentDocument;
  doc.documentElement.dataset.theme = "dark";
  doc.documentElement.dataset.themeMode = "dark";
  const b = doc.getElementById("demoBanner");
  if (b) b.remove();
  const consent = doc.getElementById("dataUseDisclosureDialog");
  if (consent) consent.close();
  // collapse sidebar
  const collapseBtn = doc.getElementById("sidebarCollapseButton");
  if (collapseBtn) collapseBtn.click();
  setTimeout(() => {
    // Show flyout on first folder
    const item = doc.querySelector(".sidebar-item[data-folder-id]");
    if (item) {
      item.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
    }
  }, 200);
};
</script>
</body>
</html>"""
capture(html_dock, f"{SCREENSHOTS_DIR}/03_dock_flyout.png")

# 4. Appearance Modal (Current v2.5 with 6 Space Gradients)
html_modal = """<!DOCTYPE html>
<html>
<head><style>body,html{margin:0;padding:0;width:1280px;height:800px;overflow:hidden;}iframe{width:1280px;height:800px;border:none;}</style></head>
<body>
<iframe id="f" src="index.html"></iframe>
<script>
document.getElementById("f").onload = () => {
  const win = document.getElementById("f").contentWindow;
  const doc = document.getElementById("f").contentDocument;
  const b = doc.getElementById("demoBanner");
  if (b) b.remove();
  const consent = doc.getElementById("dataUseDisclosureDialog");
  if (consent) consent.close();
  setTimeout(() => {
    const dialog = doc.getElementById("appearanceDialog");
    if (dialog) dialog.showModal();
  }, 200);
};
</script>
</body>
</html>"""
capture(html_modal, f"{SCREENSHOTS_DIR}/04_appearance_modal.png")

# 5. Promo Tiles
# Small promo tile: 440x280 (RGB)
hero_img = Image.open(f"{SCREENSHOTS_DIR}/01_hero_dark.png").convert("RGB")
# Crop nicely centered around top header & search
promo_small = hero_img.crop((200, 40, 1080, 600)).resize((440, 280), Image.Resampling.LANCZOS)
promo_small.save(f"{PROMO_DIR}/promo_small_440x280.png", "PNG", optimize=True)
print(f"✓ Generated {PROMO_DIR}/promo_small_440x280.png: {promo_small.size}")

# Marquee promo tile: 1400x560 (RGB)
# Create 1400x560 canvas
scale = 1400 / 1280
scaled_h = int(800 * scale)
hero_scaled = hero_img.resize((1400, scaled_h), Image.Resampling.LANCZOS)
top_crop = max(0, (scaled_h - 560) // 3)
marquee = hero_scaled.crop((0, top_crop, 1400, top_crop + 560))
marquee.save(f"{PROMO_DIR}/promo_marquee_1400x560.png", "PNG", optimize=True)
print(f"✓ Generated {PROMO_DIR}/promo_marquee_1400x560.png: {marquee.size}")

if os.path.exists("shot_modal.html"):
    os.remove("shot_modal.html")
if os.path.exists("scratch_test.png"):
    os.remove("scratch_test.png")
print("All store assets regenerated successfully!")
