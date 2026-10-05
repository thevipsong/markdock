"""Find a large favicon for a public website and keep a small local cache."""

from __future__ import annotations

from contextlib import contextmanager
from dataclasses import dataclass
import hashlib
from html.parser import HTMLParser
import http.client
import ipaddress
import json
import math
from pathlib import Path
import socket
import struct
import threading
import time
from typing import Optional
from urllib.error import HTTPError, URLError
from urllib.parse import urljoin, urlsplit, urlunsplit
from urllib.request import HTTPHandler, HTTPRedirectHandler, HTTPSHandler, Request, build_opener


CACHE_DIR = Path(__file__).resolve().parent / ".icon-cache"
POSITIVE_TTL = 7 * 24 * 60 * 60
NEGATIVE_TTL = 30 * 60
MAX_HTML = 400_000
MAX_ICON = 1_000_000
MAX_ICON_DIMENSION = 2048
MAX_ICON_PIXELS = 1_048_576
MAX_ICO_IMAGES = 256
MAX_CANDIDATES = 16
MAX_DECLARED_CANDIDATES = 4
FETCH_TIMEOUT = 3.5
ICON_DISCOVERY_BUDGET = 10.0
MAX_CACHE_BYTES = 128 * 1024 * 1024
MAX_CACHE_ENTRIES = 512
CACHE_PRUNE_INTERVAL = 60 * 60
CACHE_PRUNE_BATCH = 8


@dataclass
class _KeyLock:
    lock: threading.Lock
    users: int = 0


_locks: dict[str, _KeyLock] = {}
_locks_guard = threading.Lock()
_cache_lock = threading.Lock()
_last_cache_prune = 0.0
_cache_stores_since_prune = 0


@contextmanager
def _serialized_key(key: str):
    with _locks_guard:
        entry = _locks.get(key)
        if entry is None:
            entry = _KeyLock(threading.Lock())
            _locks[key] = entry
        entry.users += 1
    try:
        with entry.lock:
            yield
    finally:
        with _locks_guard:
            entry.users -= 1
            if entry.users == 0 and _locks.get(key) is entry:
                del _locks[key]


def _public_origin(raw: str, *, allow_nonstandard_port: bool = False) -> Optional[str]:
    try:
        parsed = urlsplit(raw)
        if parsed.scheme not in ("http", "https") or not parsed.hostname:
            return None
        default_port = 80 if parsed.scheme == "http" else 443
        if (parsed.username is not None or parsed.password is not None
                or (not allow_nonstandard_port and parsed.port not in (None, default_port))):
            return None
        host = parsed.hostname.rstrip(".").lower()
        if host == "localhost" or host.endswith((".localhost", ".local", ".lan", ".internal", ".test", ".home.arpa")):
            return None
        try:
            address = ipaddress.ip_address(host)
            host = address.compressed
            netloc_host = f"[{host}]" if address.version == 6 else host
        except ValueError:
            host = host.encode("idna").decode("ascii")
            netloc_host = host
        port_suffix = f":{parsed.port}" if parsed.port is not None and parsed.port != default_port else ""
        return f"{parsed.scheme}://{netloc_host}{port_suffix}"
    except (UnicodeError, ValueError):
        return None


def _icon_lookup_urls(raw: str, origin: str) -> tuple[str, str] | None:
    """Return the bookmarked page URL and its app-scoped icon directory."""
    try:
        parsed = urlsplit(raw)
        path = parsed.path or "/"
        page_url = origin + path
        if path.endswith("/"):
            directory_path = path
        else:
            last_segment = path.rsplit("/", 1)[-1]
            suffix = last_segment.rpartition(".")[2]
            has_file_extension = (
                "." in last_segment
                and 1 <= len(suffix) <= 12
                and suffix.isascii()
                and suffix.isalnum()
            )
            directory_path = (
                path[:path.rfind("/") + 1] or "/"
                if has_file_extension
                else f"{path}/"
            )
        return page_url, f"{origin}{directory_path}"
    except ValueError:
        return None


def _public_addresses(raw: str, *, allow_nonstandard_port: bool = False) -> tuple[tuple, ...] | None:
    origin = _public_origin(raw, allow_nonstandard_port=allow_nonstandard_port)
    if not origin:
        return None
    try:
        parsed = urlsplit(origin)
        host = parsed.hostname
        if not host:
            return None
        port = parsed.port or (443 if parsed.scheme == "https" else 80)
        addresses = socket.getaddrinfo(host, port, type=socket.SOCK_STREAM)
        if not addresses:
            return None
        unique = []
        seen = set()
        for entry in addresses:
            address = ipaddress.ip_address(entry[4][0].split("%", 1)[0])
            if not address.is_global:
                return None
            key = (entry[0], entry[4])
            if key not in seen:
                seen.add(key)
                unique.append(entry)
        return tuple(unique) or None
    except (OSError, ValueError, TypeError):
        return None


class _PinnedSocketMixin:
    def _connect_pinned_socket(self):
        failures = []
        for family, socktype, proto, _, sockaddr in self._pinned_addresses:
            connection = socket.socket(family, socktype, proto)
            try:
                if self.timeout is not socket._GLOBAL_DEFAULT_TIMEOUT:
                    connection.settimeout(self.timeout)
                if self.source_address:
                    connection.bind(self.source_address)
                connection.connect(sockaddr)
                connection.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
                return connection
            except OSError as error:
                failures.append(error)
                connection.close()
        if failures:
            raise failures[-1]
        raise OSError("No validated public address available")


class _PinnedHTTPConnection(_PinnedSocketMixin, http.client.HTTPConnection):
    def __init__(self, host, *args, pinned_addresses=None, **kwargs):
        self._pinned_addresses = tuple(pinned_addresses or ())
        super().__init__(host, *args, **kwargs)

    def connect(self):
        if self._tunnel_host or not self._pinned_addresses:
            return super().connect()
        self.sock = self._connect_pinned_socket()


class _PinnedHTTPSConnection(_PinnedSocketMixin, http.client.HTTPSConnection):
    def __init__(self, host, *args, pinned_addresses=None, server_hostname=None, tunnel_port=None, **kwargs):
        self._pinned_addresses = tuple(pinned_addresses or ())
        self._server_hostname = server_hostname or host
        self._pinned_tunnel_port = tunnel_port
        super().__init__(host, *args, **kwargs)

    def set_tunnel(self, host, port=None, headers=None):
        # urllib's do_open calls set_tunnel without the destination port. Use
        # the origin's validated HTTPS port instead of the proxy's port.
        if port is None and self._pinned_tunnel_port is not None:
            port = self._pinned_tunnel_port
        super().set_tunnel(host, port=port, headers=headers)

    def connect(self):
        if self._tunnel_host:
            # Connect to the configured proxy and tunnel to the validated IP.
            http.client.HTTPConnection.connect(self)
        elif self._pinned_addresses:
            self.sock = self._connect_pinned_socket()
        else:
            http.client.HTTPConnection.connect(self)
        self.sock = self._context.wrap_socket(self.sock, server_hostname=self._server_hostname)


def _pin_request_target(
    request: Request,
    *,
    allow_nonstandard_port: bool = False,
) -> tuple[tuple[tuple, ...], str, bool]:
    origin = _public_origin(request.get_full_url(), allow_nonstandard_port=allow_nonstandard_port)
    addresses = _public_addresses(origin, allow_nonstandard_port=allow_nonstandard_port) if origin else None
    if not addresses:
        raise URLError("Blocked non-public destination")

    parsed = urlsplit(origin)
    server_hostname = parsed.hostname
    through_proxy = bool(request._tunnel_host) or request.selector == request.full_url
    if through_proxy:
        chosen_ip = ipaddress.ip_address(addresses[0][4][0].split("%", 1)[0])
        pinned_host = f"[{chosen_ip.compressed}]" if chosen_ip.version == 6 else chosen_ip.compressed
        request.add_header("Host", parsed.netloc)
        if request._tunnel_host:
            # HTTPS proxies receive CONNECT for the validated IP, while TLS
            # below still verifies the certificate against the original host.
            request._tunnel_host = pinned_host
            request._tunnel_port = parsed.port or 443
        else:
            port_suffix = f":{parsed.port}" if parsed.port else ""
            pinned_netloc = f"{pinned_host}{port_suffix}"
            request.selector = urlunsplit((parsed.scheme, pinned_netloc, parsed.path or "/", parsed.query, ""))
    return addresses, server_hostname, through_proxy


class _PinnedHTTPHandler(HTTPHandler):
    def __init__(self, *, allow_nonstandard_port: bool = False):
        super().__init__()
        self.allow_nonstandard_port = allow_nonstandard_port

    def http_open(self, request):
        addresses, _, through_proxy = _pin_request_target(
            request,
            allow_nonstandard_port=self.allow_nonstandard_port,
        )

        def connection_factory(host, *args, **kwargs):
            return _PinnedHTTPConnection(
                host,
                *args,
                pinned_addresses=None if through_proxy else addresses,
                **kwargs,
            )

        return self.do_open(connection_factory, request)


class _PinnedHTTPSHandler(HTTPSHandler):
    def __init__(self, *, allow_nonstandard_port: bool = False):
        super().__init__()
        self.allow_nonstandard_port = allow_nonstandard_port

    def https_open(self, request):
        addresses, server_hostname, through_proxy = _pin_request_target(
            request,
            allow_nonstandard_port=self.allow_nonstandard_port,
        )

        def connection_factory(host, *args, **kwargs):
            return _PinnedHTTPSConnection(
                host,
                *args,
                pinned_addresses=None if through_proxy else addresses,
                server_hostname=server_hostname,
                tunnel_port=request._tunnel_port if request._tunnel_host else None,
                **kwargs,
            )

        return self.do_open(
            connection_factory,
            request,
            context=self._context,
            check_hostname=self._check_hostname,
        )


class _PublicRedirects(HTTPRedirectHandler):
    def __init__(self, *, allow_nonstandard_port: bool = False):
        super().__init__()
        self.allow_nonstandard_port = allow_nonstandard_port

    def redirect_request(self, request, response, code, message, headers, new_url):
        target = urljoin(request.full_url, new_url)
        if not _public_addresses(target, allow_nonstandard_port=self.allow_nonstandard_port):
            raise HTTPError(target, 403, "Blocked non-public redirect", headers, response)
        return super().redirect_request(request, response, code, message, headers, target)


_opener = build_opener(_PinnedHTTPHandler(), _PinnedHTTPSHandler(), _PublicRedirects())
_public_link_opener = build_opener(
    _PinnedHTTPHandler(allow_nonstandard_port=True),
    _PinnedHTTPSHandler(allow_nonstandard_port=True),
    _PublicRedirects(allow_nonstandard_port=True),
)


def open_public_link(request: Request, timeout: Optional[float] = None):
    """Open a public bookmark URL with DNS pinning and safe redirect checks."""
    if not _public_origin(request.get_full_url(), allow_nonstandard_port=True):
        raise URLError("Blocked non-public destination")
    return _public_link_opener.open(request, timeout=timeout)


def _response_socket(response):
    layer = response
    for _ in range(4):
        sock = getattr(layer, "_sock", None)
        if sock is not None:
            return sock
        layer = getattr(layer, "fp", None) or getattr(layer, "raw", None)
        if layer is None:
            break
    return None


def _fetch(url: str, limit: int, deadline: Optional[float] = None) -> Optional[tuple[bytes, str]]:
    if not _public_origin(url):
        return None
    started_at = time.monotonic()
    fetch_deadline = started_at + FETCH_TIMEOUT
    if deadline is not None:
        fetch_deadline = min(fetch_deadline, deadline)
    timeout = fetch_deadline - started_at
    if timeout <= 0:
        return None
    request = Request(url, headers={
        "User-Agent": "Mozilla/5.0 (compatible; ShiyeBookmarkGallery/2.0)",
        "Accept": "image/avif,image/webp,image/png,image/svg+xml,image/jpeg,image/gif,image/x-icon,text/html;q=0.7,*/*;q=0.4",
    })
    try:
        with _opener.open(request, timeout=timeout) as response:
            if response.status != 200:
                return None
            response_socket = _response_socket(response)
            content = bytearray()
            # Recompute the remaining time between single-read chunks; read()
            # can keep consuming a slow trickle long after its initial timeout.
            while len(content) <= limit:
                remaining = fetch_deadline - time.monotonic()
                if remaining <= 0:
                    return None
                if response_socket is not None:
                    response_socket.settimeout(remaining)
                chunk = response.read1(min(64 * 1024, limit + 1 - len(content)))
                if not chunk:
                    break
                content.extend(chunk)
            if len(content) > limit:
                return None
            return bytes(content), response.headers.get_content_type()
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
    def raster_details(mime: str, width: int, height: int) -> tuple[str, int] | None:
        if (width < 1 or height < 1 or width > MAX_ICON_DIMENSION
                or height > MAX_ICON_DIMENSION or width * height > MAX_ICON_PIXELS):
            return None
        return mime, min(width, height)

    stripped = data.lstrip()
    if stripped.startswith(b"<svg") or (b"<svg" in stripped[:500].lower() and b"</svg>" in data[-500:].lower()):
        return "image/svg+xml", 256
    if data.startswith(b"\x89PNG\r\n\x1a\n") and len(data) >= 24:
        width, height = struct.unpack(">II", data[16:24])
        return raster_details("image/png", width, height)
    if data.startswith(b"\x00\x00\x01\x00") and len(data) >= 22:
        count = struct.unpack("<H", data[4:6])[0]
        directory_end = 6 + count * 16
        if count < 1 or count > MAX_ICO_IMAGES or directory_end > len(data):
            return None
        sizes = []
        for index in range(count):
            entry = 6 + index * 16
            resource_size, resource_offset = struct.unpack("<II", data[entry + 8:entry + 16])
            resource_end = resource_offset + resource_size
            if (resource_size < 1 or resource_offset < directory_end
                    or resource_end > len(data)):
                continue
            resource = data[resource_offset:resource_end]
            if resource.startswith(b"\x89PNG\r\n\x1a\n"):
                details = _image_details(resource)
                if details:
                    sizes.append(details[1])
                continue

            if len(resource) < 12:
                continue
            dib_header_size = struct.unpack("<I", resource[:4])[0]
            if dib_header_size == 12:
                dib_width, doubled_height = struct.unpack("<HH", resource[4:8])
                if doubled_height % 2:
                    continue
                dib_height = doubled_height // 2
            elif 40 <= dib_header_size <= len(resource):
                dib_width = struct.unpack("<i", resource[4:8])[0]
                doubled_height = struct.unpack("<i", resource[8:12])[0]
                if doubled_height == 0 or abs(doubled_height) % 2:
                    continue
                dib_height = abs(doubled_height) // 2
            else:
                continue
            actual_size = raster_details("image/x-icon", dib_width, dib_height)
            if actual_size:
                sizes.append(actual_size[1])
        return ("image/x-icon", max(sizes)) if sizes else None
    if data.startswith((b"GIF87a", b"GIF89a")) and len(data) >= 10:
        width, height = struct.unpack("<HH", data[6:10])
        return raster_details("image/gif", width, height)
    if data.startswith(b"RIFF") and data[8:12] == b"WEBP":
        if data[12:16] == b"VP8X" and len(data) >= 30:
            width = 1 + int.from_bytes(data[24:27], "little")
            height = 1 + int.from_bytes(data[27:30], "little")
            return raster_details("image/webp", width, height)
        if data[12:16] == b"VP8L" and len(data) >= 25 and data[20] == 0x2F:
            dimensions = int.from_bytes(data[21:25], "little")
            width = (dimensions & 0x3FFF) + 1
            height = ((dimensions >> 14) & 0x3FFF) + 1
            return raster_details("image/webp", width, height)
        if (data[12:16] == b"VP8 " and len(data) >= 30
                and data[23:26] == b"\x9d\x01\x2a"):
            width = int.from_bytes(data[26:28], "little") & 0x3FFF
            height = int.from_bytes(data[28:30], "little") & 0x3FFF
            return raster_details("image/webp", width, height)
        return None
    if data.startswith(b"\xff\xd8"):
        offset = 2
        frame_markers = {0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF}
        while offset + 9 < len(data):
            if data[offset] != 0xFF:
                offset += 1
                continue
            marker = data[offset + 1]
            if marker in (0xD8, 0xD9, 0x01) or 0xD0 <= marker <= 0xD7:
                offset += 2
                continue
            segment_length = int.from_bytes(data[offset + 2:offset + 4], "big")
            if segment_length < 2:
                return None
            if marker in frame_markers and segment_length >= 7 and offset + 9 <= len(data):
                height = int.from_bytes(data[offset + 5:offset + 7], "big")
                width = int.from_bytes(data[offset + 7:offset + 9], "big")
                return raster_details("image/jpeg", width, height)
            offset += segment_length + 2
        return None
    return None


def _discover(origin: str, page_url: str, app_directory: str) -> tuple[bytes, str] | None:
    deadline = time.monotonic() + ICON_DISCOVERY_BUDGET
    declared_candidates: list[tuple[str, int]] = []
    page_deadline = min(deadline, time.monotonic() + 2.0)
    page = _fetch(page_url, MAX_HTML, page_deadline)
    if page and page[1] in ("text/html", "application/xhtml+xml"):
        parser = _IconLinks()
        parser.feed(page[0].decode("utf-8", errors="ignore"))
        declared_candidates = sorted(
            ((urljoin(page_url, href), declared) for href, declared in parser.links),
            key=lambda entry: entry[1],
            reverse=True,
        )[:MAX_DECLARED_CANDIDATES]

    fallback_paths = [
        ("favicon-512x512.png", 512),
        ("android-chrome-512x512.png", 512),
        ("apple-touch-icon.png", 180),
        ("apple-touch-icon-precomposed.png", 180),
        ("favicon.svg", 256),
        ("favicon-192x192.png", 192),
        ("favicon-96x96.png", 96),
        ("favicon-64x64.png", 64),
        ("favicon-48x48.png", 48),
        ("favicon-32x32.png", 32),
        ("favicon.ico", 32),
    ]
    app_candidates = [
        *declared_candidates,
        *[
            (urljoin(app_directory, path), size)
            for path, size in fallback_paths
        ],
    ]
    app_candidates.sort(key=lambda entry: entry[1], reverse=True)
    first_party_candidates = []
    seen: set[str] = set()
    for candidate in app_candidates:
        if candidate[0] in seen:
            continue
        seen.add(candidate[0])
        first_party_candidates.append(candidate)
        if len(first_party_candidates) >= MAX_CANDIDATES:
            break

    root_candidates = []
    if app_directory != origin + "/":
        for path, size in fallback_paths:
            candidate = urljoin(origin + "/", path)
            if candidate not in seen:
                seen.add(candidate)
                root_candidates.append((candidate, size))
    root_candidates.sort(key=lambda entry: entry[1], reverse=True)
    candidate_groups = [group for group in (first_party_candidates, root_candidates) if group]
    remaining_probe_count = sum(len(group) for group in candidate_groups)
    for candidates in candidate_groups:
        best: tuple[bytes, str] | None = None
        best_size = 0
        for candidate, _ in candidates:
            if time.monotonic() >= deadline:
                break
            remaining = deadline - time.monotonic()
            probe_deadline = min(deadline, time.monotonic() + remaining / remaining_probe_count)
            remaining_probe_count -= 1
            fetched = _fetch(candidate, MAX_ICON, probe_deadline)
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
        # A usable page-specific icon is more trustworthy than an unrelated
        # root icon from another app sharing the same host.
        if best:
            return best

    # Send the bookmark origin to Google only when the site itself exposes no
    # usable icon. This keeps the fallback genuinely last-resort and avoids
    # replacing even a small first-party favicon with Google's rendition.
    if time.monotonic() >= deadline:
        return None
    google_fallback = (
        "https://t3.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL"
        f"&url={origin}&size=128"
    )
    fetched = _fetch(google_fallback, MAX_ICON, deadline)
    details = _image_details(fetched[0]) if fetched else None
    if not fetched or not details:
        return None
    return fetched[0], details[0]


def _cached(key: str) -> tuple[bytes, str] | None | bool:
    metadata_path = CACHE_DIR / f"{key}.json"
    try:
        metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
        checked_at = float(metadata["checked_at"])
        if not math.isfinite(checked_at) or checked_at > time.time():
            return False
        age = time.time() - checked_at
        ttl = POSITIVE_TTL if metadata.get("mime") else NEGATIVE_TTL
        if age >= ttl:
            return False
        if not metadata.get("mime"):
            return None
        data = (CACHE_DIR / f"{key}.bin").read_bytes()
        details = _image_details(data)
        if details:
            return data, details[0]
    except (OSError, ValueError, KeyError, TypeError):
        pass
    return False


def _store(key: str, result: tuple[bytes, str] | None) -> None:
    global _last_cache_prune, _cache_stores_since_prune
    try:
        with _cache_lock:
            CACHE_DIR.mkdir(exist_ok=True)
            binary_path = CACHE_DIR / f"{key}.bin"
            metadata_path = CACHE_DIR / f"{key}.json"
            if result:
                temporary_binary_path = CACHE_DIR / f"{key}.bin.tmp"
                temporary_binary_path.write_bytes(result[0])
                temporary_binary_path.replace(binary_path)
            else:
                binary_path.unlink(missing_ok=True)
                (CACHE_DIR / f"{key}.bin.tmp").unlink(missing_ok=True)
            metadata = {"checked_at": time.time(), "mime": result[1] if result else None}
            temporary_path = CACHE_DIR / f"{key}.json.tmp"
            temporary_path.write_text(json.dumps(metadata), encoding="utf-8")
            temporary_path.replace(metadata_path)
            _cache_stores_since_prune += 1
            if (_cache_stores_since_prune >= CACHE_PRUNE_BATCH
                    or time.time() - _last_cache_prune >= CACHE_PRUNE_INTERVAL):
                _prune_cache_locked()
                _last_cache_prune = time.time()
                _cache_stores_since_prune = 0
    except OSError:
        pass


def _prune_cache_locked() -> None:
    now = time.time()
    entries: list[tuple[float, int, str]] = []
    total_bytes = 0
    live_keys: set[str] = set()

    def remove_entry(key: str) -> None:
        for suffix in (".json", ".bin", ".json.tmp", ".bin.tmp"):
            try:
                (CACHE_DIR / f"{key}{suffix}").unlink(missing_ok=True)
            except OSError:
                pass

    for metadata_path in CACHE_DIR.glob("*.json"):
        key = metadata_path.stem
        if len(key) != 64 or any(character not in "0123456789abcdef" for character in key):
            continue
        binary_path = CACHE_DIR / f"{key}.bin"
        try:
            metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
            checked_at = float(metadata["checked_at"])
            if not math.isfinite(checked_at) or checked_at > now:
                remove_entry(key)
                continue
            has_icon = bool(metadata.get("mime"))
            ttl = POSITIVE_TTL if has_icon else NEGATIVE_TTL
            if now - checked_at >= ttl or (has_icon and not binary_path.is_file()):
                remove_entry(key)
                continue
            entry_bytes = metadata_path.stat().st_size
            if has_icon:
                entry_bytes += binary_path.stat().st_size
            entries.append((checked_at, entry_bytes, key))
            live_keys.add(key)
            total_bytes += entry_bytes
        except (OSError, ValueError, KeyError, TypeError):
            remove_entry(key)

    for binary_path in CACHE_DIR.glob("*.bin"):
        key = binary_path.stem
        if len(key) == 64 and all(character in "0123456789abcdef" for character in key) and key not in live_keys:
            try:
                binary_path.unlink(missing_ok=True)
            except OSError:
                pass

    for suffix in ("*.json.tmp", "*.bin.tmp"):
        for temporary_path in CACHE_DIR.glob(suffix):
            key = temporary_path.name.split(".", 1)[0]
            if len(key) == 64 and all(character in "0123456789abcdef" for character in key):
                try:
                    temporary_path.unlink(missing_ok=True)
                except OSError:
                    pass

    entries.sort(key=lambda entry: entry[0])
    while entries and (len(entries) > MAX_CACHE_ENTRIES or total_bytes > MAX_CACHE_BYTES):
        _, entry_bytes, key = entries.pop(0)
        remove_entry(key)
        total_bytes -= entry_bytes


def _prune_cache_if_due() -> None:
    global _last_cache_prune, _cache_stores_since_prune
    now = time.time()
    if now - _last_cache_prune < CACHE_PRUNE_INTERVAL:
        return
    try:
        with _cache_lock:
            now = time.time()
            if now - _last_cache_prune < CACHE_PRUNE_INTERVAL:
                return
            if CACHE_DIR.exists():
                _prune_cache_locked()
            _last_cache_prune = now
            _cache_stores_since_prune = 0
    except OSError:
        pass


def find_icon(raw_url: str) -> tuple[bytes, str] | None:
    origin = _public_origin(raw_url)
    if not origin:
        return None
    lookup_urls = _icon_lookup_urls(raw_url, origin)
    if not lookup_urls:
        return None
    page_url, app_directory = lookup_urls
    key = hashlib.sha256(app_directory.encode("utf-8")).hexdigest()
    _prune_cache_if_due()
    cached = _cached(key)
    if cached is not False:
        return cached
    with _serialized_key(key):
        cached = _cached(key)
        if cached is not False:
            return cached
        if not _public_addresses(origin):
            return None
        result = _discover(origin, page_url, app_directory)
        _store(key, result)
        return result
