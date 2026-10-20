#!/usr/bin/env python3
"""
MarkDock Chrome Web Store Packaging Script
Creates a clean, production-ready distribution zip without development artifacts,
hidden OS files, or unused assets.
"""
import json
import os
import zipfile

DIST_DIR = "dist"

FILES_TO_PACK = [
    "manifest.json",
    "background.js",
    "app.js",
    "appearance.js",
    "theme-init.js",
    "index.html",
    "styles.css",
    "privacy.html",
    "favicon.svg",
    "extension-icon-16.png",
    "extension-icon-32.png",
    "extension-icon-48.png",
    "extension-icon-128.png",
    "assets/brand/markdock-mark-compact.svg"
]

def main():
    with open("manifest.json", "r", encoding="utf-8") as f:
        manifest = json.load(f)
    version = manifest.get("version", "unknown")
    zip_name = f"markdock-v{version}.zip"
    zip_path = os.path.join(DIST_DIR, zip_name)

    os.makedirs(DIST_DIR, exist_ok=True)

    for file_path in FILES_TO_PACK:
        if not os.path.isfile(file_path):
            raise FileNotFoundError(f"Missing required file: {file_path}")

    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as zf:
        for file_path in FILES_TO_PACK:
            zf.write(file_path, arcname=file_path)

    size_kb = os.path.getsize(zip_path) / 1024
    print(f"✓ Packaging complete: {zip_path} ({size_kb:.1f} KB)")
    print("Files included:")
    with zipfile.ZipFile(zip_path, "r") as zf:
        for info in zf.infolist():
            print(f"  - {info.filename:40} ({info.file_size/1024:6.1f} KB -> {info.compress_size/1024:5.1f} KB)")

if __name__ == "__main__":
    main()
