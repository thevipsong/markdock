#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""品牌改名：用户可见文案 拾页/栖屿 -> MarkDock 书签坞。
内部标识 (qidian-* 存储键、IndexedDB 名) 不在替换范围内。
导入识别正则特殊处理：保留对 MarkDock/栖屿/拾页/栖点 旧导出文件的识别兼容。"""
import pathlib

base = pathlib.Path(__file__).parent


def patch(name, pairs):
    p = base / name
    if not p.exists():
        return
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


for name in ["index.html", "README.md", "manifest.json", "appearance.js", "background.js", "serve.py", "styles.css"]:
    patch(name, [("拾页", "MarkDock"), ("栖屿", "MarkDock")])

print("RENAME_DONE")
