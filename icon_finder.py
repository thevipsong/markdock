"""Find a large favicon for a public website and keep a small local cache."""

from __future__ import annotations

import hashlib
from html.parser import HTMLParser
import ipaddress
import json
from pathlib import Path
import socket
import struct
import threading
import time
from urllib.error import HTTPError, URLError
from urllib.parse import urljoin, urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener, getproxies, proxy_bypass


CACHE_DIR = Path(__file__).resolve().parent / ".icon-cache"
POSITIVE_TTL = 7 * 24 * 60 * 60
NEGATIVE_TTL = 12 * 60 * 60
MAX_HTML = 400_000
MAX_ICON = 1_000_000
MAX_CANDIDATES = 8
_locks: dict[str, threading.Lock] = {}
_locks_guard = threading.Lock()
_PROXY_V4 = ipaddress.ip_network("198.18.0.0/15")
_PROXY_V6 = ipaddress.ip_network("2001:2::/48")


def _public_url(raw: str) -> bool:
    try:
        parsed = urlsplit(raw)
        if parsed.scheme not in ("http", "https") or not parsed.hostname:
            return False
        if parsed.username or parsed.password:
            return False
        if parsed.port not in (None, 80, 443):
            return False
        host = parsed.hostname.rstrip(".").lower()
        if host == "localhost" or host.endswith((".local", ".internal", ".test", ".home.arpa")):
            return False
        addresses = socket.getaddrinfo(host, None, type=socket.SOCK_STREAM)
        proxy_active = bool(getproxies().get(parsed.scheme)) and not proxy_bypass(host)
        return bool(addresses) and all(
            ipaddress.ip_address(entry[4][0]).is_global
            or (proxy_active and ipaddress.ip_address(entry[4][0]) in (_PROXY_V4 if entry[0] == socket.AF_INET else _PROXY_V6))
            for entry in addresses
        )
    except (OSError, ValueError):
        return False


class _PublicRedirects(HTTPRedirectHandler):
    def redirect_request(self, request, response, code, message, headers, new_url):
        if not _public_url(new_url):
            raise HTTPError(new_url, 403, "Blocked non-public redirect", headers, response)
        return super().redirect_request(request, response, code, message, headers, new_url)


_opener = build_opener(_PublicRedirects())


def _fetch(url: str, limit: int) -> tuple[bytes, str] | None:
    if not _public_url(url):
        return None
    request = Request(url, headers={
        "User-Agent": "Mozilla/5.0 (compatible; QidianBookmarkGallery/2.0)",
        "Accept": "image/avif,image/webp,image/png,image/svg+xml,image/jpeg,image/gif,image/x-icon,text/html;q=0.7,*/*;q=0.4",
    })
    try:
        with _opener.open(request, timeout=3.5) as response:
            if response.status != 200:
                return None
            content = response.read(limit + 1)
            if len(content) > limit:
                return None
            return content, response.headers.get_content_type()
    except (OSError, HTTPError, URLError, ValueError):
        return None


class _IconLinks(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.links: list[tuple[str, int]] = []

    def handle_starttag(self, tag: str, attributes: list[tuple[str, str | None]]) -> None:
        if tag != "link":
            return
        attrs = {key.lower(): (value or "") for key, value in attributes}
        rel = attrs.get("rel", "").lower()
        href = attrs.get("href", "")
        if not href or "icon" not in rel or "mask-icon" in rel:
            return
        sizes = attrs.get("sizes", "")
        declared = 0
        for size in sizes.split():
            try:
                width, height = (int(part) for part in size.lower().split("x", 1))
                declared = max(declared, min(width, height))
            except ValueError:
                continue
        if "apple-touch-icon" in rel:
            declared = max(declared, 180)
        elif "svg" in attrs.get("type", "").lower() or href.lower().endswith(".svg"):
            declared = max(declared, 256)
        self.links.append((href, declared))


def _image_details(data: bytes) -> tuple[str, int] | None:
    stripped = data.lstrip()
    if stripped.startswith(b"<svg") or (b"<svg" in stripped[:500].lower() and b"</svg>" in data[-500:].lower()):
        return "image/svg+xml", 256
    if data.startswith(b"\x89PNG\r\n\x1a\n") and len(data) >= 24:
        width, height = struct.unpack(">II", data[16:24])
        return "image/png", min(width, height)
    if data.startswith(b"\x00\x00\x01\x00") and len(data) >= 22:
        count = min(struct.unpack("<H", data[4:6])[0], (len(data) - 6) // 16)
        sizes = [min(data[6 + i * 16] or 256, data[7 + i * 16] or 256) for i in range(count)]
        return ("image/x-icon", max(sizes)) if sizes else None
    if data.startswith((b"GIF87a", b"GIF89a")) and len(data) >= 10:
        width, height = struct.unpack("<HH", data[6:10])
        return "image/gif", min(width, height)
    if data.startswith(b"RIFF") and data[8:12] == b"WEBP":
        if data[12:16] == b"VP8X" and len(data) >= 30:
            width = 1 + int.from_bytes(data[24:27], "little")
            height = 1 + int.from_bytes(data[27:30], "little")
            return "image/webp", min(width, height)
        return "image/webp", 96
    if data.startswith(b"\xff\xd8"):
        offset = 2
        while offset + 9 < len(data):
            if data[offset] != 0xFF:
                offset += 1
                continue
            marker = data[offset + 1]
            if marker in (0xD8, 0xD9):
                offset += 2
                continue
            segment_length = int.from_bytes(data[offset + 2:offset + 4], "big")
            if segment_length < 2:
                break
            if marker in (0xC0, 0xC1, 0xC2, 0xC3) and offset + 9 <= len(data):
                height = int.from_bytes(data[offset + 5:offset + 7], "big")
                width = int.from_bytes(data[offset + 7:offset + 9], "big")
                return "image/jpeg", min(width, height)
            offset += segment_length + 2
        return "image/jpeg", 64
    return None


def _discover(origin: str) -> tuple[bytes, str] | None:
    candidates: list[tuple[str, int]] = []
    page = _fetch(origin + "/", MAX_HTML)
    if page and page[1] in ("text/html", "application/xhtml+xml"):
        parser = _IconLinks()
        parser.feed(page[0].decode("utf-8", errors="ignore"))
        for href, declared in parser.links:
            candidates.append((urljoin(origin + "/", href), declared))
    candidates.extend([
        (origin + "/apple-touch-icon.png", 180),
        (origin + "/favicon-192x192.png", 192),
        (origin + "/favicon.ico", 32),
    ])
    candidates.sort(key=lambda entry: entry[1], reverse=True)
    best: tuple[bytes, str] | None = None
    best_size = 0
    seen: set[str] = set()
    for candidate, _ in candidates:
        if candidate in seen:
            continue
        seen.add(candidate)
        if len(seen) > MAX_CANDIDATES:
            break
        fetched = _fetch(candidate, MAX_ICON)
        if not fetched:
            continue
        details = _image_details(fetched[0])
        if not details:
            continue
        mime, size = details
        if size > best_size:
            best = fetched[0], mime
            best_size = size
        if best_size >= 180:
            break
    return best


def _cached(key: str) -> tuple[bytes, str] | None | bool:
    metadata_path = CACHE_DIR / f"{key}.json"
    try:
        metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
        age = time.time() - float(metadata["checked_at"])
        ttl = POSITIVE_TTL if metadata.get("mime") else NEGATIVE_TTL
        if age >= ttl:
            return False
        if not metadata.get("mime"):
            return None
        data = (CACHE_DIR / f"{key}.bin").read_bytes()
        if _image_details(data):
            return data, metadata["mime"]
    except (OSError, ValueError, KeyError, TypeError):
        pass
    return False


def _store(key: str, result: tuple[bytes, str] | None) -> None:
    try:
        CACHE_DIR.mkdir(exist_ok=True)
        if result:
            (CACHE_DIR / f"{key}.bin").write_bytes(result[0])
        metadata = {"checked_at": time.time(), "mime": result[1] if result else None}
        (CACHE_DIR / f"{key}.json").write_text(json.dumps(metadata), encoding="utf-8")
    except OSError:
        pass


def find_icon(raw_url: str) -> tuple[bytes, str] | None:
    try:
        parsed = urlsplit(raw_url)
        origin = f"{parsed.scheme}://{parsed.netloc}"
        if not _public_url(origin):
            return None
    except ValueError:
        return None
    key = hashlib.sha256(origin.encode("utf-8")).hexdigest()
    cached = _cached(key)
    if cached is not False:
        return cached
    with _locks_guard:
        lock = _locks.setdefault(key, threading.Lock())
    with lock:
        cached = _cached(key)
        if cached is not False:
            return cached
        result = _discover(origin)
        _store(key, result)
        return result
