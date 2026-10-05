#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""品牌改名：用户可见文案 拾页 -> 栖屿。
内部标识 (qidian-* 存储键、IndexedDB 名) 不在替换范围内。
导入识别正则特殊处理：保留对 拾页/栖点 旧导出文件的识别兼容。"""
import pathlib

base = pathlib.Path(__file__).parent


def patch(name, pairs):
    p = base / name
    text = p.read_text(encoding="utf-8")
    original = text
    for old, new in pairs:
        n = text.count(old)
        print(f"{name}: replace {old!r} x{n}")
        text = text.replace(old, new)
    if text != original:
        p.write_text(text, encoding="utf-8")
        print(f"{name}: written")
    else:
        print(f"{name}: unchanged")


# app.js: first protect the import-detection regex brand group
p = base / "app.js"
text = p.read_text(encoding="utf-8")
assert "(?:拾页|栖点)" in text, "regex brand group not found"
text = text.replace("(?:拾页|栖点)", "%%BRAND_GROUP%%")
n = text.count("拾页")
print(f"app.js: replace brand x{n}")
text = text.replace("拾页", "栖屿")
text = text.replace("%%BRAND_GROUP%%", "(?:栖屿|拾页|栖点)")
p.write_text(text, encoding="utf-8")
print("app.js: written")

for name in ["index.html", "README.md", "manifest.json", "appearance.js", "background.js"]:
    patch(name, [("拾页", "栖屿")])

print("RENAME_DONE")
