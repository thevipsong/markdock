#!/usr/bin/env python3
"""Run the bookmark gallery on this Mac with no extra dependencies."""

from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import ipaddress
import json
from pathlib import Path
import socket
import time
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, urljoin, urlsplit
from urllib.request import HTTPRedirectHandler, ProxyHandler, Request, build_opener, urlopen
import webbrowser

from icon_finder import find_icon, open_public_link

LINK_CHECK_BUDGET = 8.0


LOCAL_BOOKMARK_HOSTS = {
    "localhost", "nas", "qnap", "synology", "unraid", "router", "pve", "proxmox", "homeassistant"
}
LOCAL_BOOKMARK_SUFFIXES = (".localhost", ".local", ".lan", ".internal", ".test", ".home.arpa")
SHARED_OVERLAY_NETWORK = ipaddress.ip_network("100.64.0.0/10")


def _is_explicit_local_host(hostname: str) -> bool:
    host = str(hostname or "").strip().lower().rstrip(".")
    if not host:
        return False
    if host in LOCAL_BOOKMARK_HOSTS or host.endswith(LOCAL_BOOKMARK_SUFFIXES):
        return True
    try:
        address = ipaddress.ip_address(host)
        return (address.is_private or address.is_loopback or address.is_link_local
                or (address.version == 4 and address in SHARED_OVERLAY_NETWORK))
    except ValueError:
        # Single-label hosts are commonly resolved by a user's local DNS.
        return "." not in host


class LocalBookmarkRedirectHandler(HTTPRedirectHandler):
    def __init__(self, initial_host: str, initial_scheme: str, initial_port: int):
        super().__init__()
        self.initial_host = initial_host.lower().rstrip(".")
        self.initial_scheme = initial_scheme
        self.initial_port = initial_port

    def redirect_request(self, request, response, code, message, headers, new_url):
        target = urljoin(request.full_url, new_url)
        try:
            parsed = urlsplit(target)
            if parsed.scheme not in ("http", "https") or not parsed.hostname:
                raise ValueError("non-web redirect")
            if parsed.username is not None or parsed.password is not None:
                raise ValueError("redirect contains credentials")
            target_host = parsed.hostname.lower().rstrip(".")
            if target_host != self.initial_host or not _is_explicit_local_host(target_host):
                raise ValueError("cross-host local redirect")
            target_port = parsed.port or (443 if parsed.scheme == "https" else 80)
            standard_https_upgrade = (
                self.initial_scheme == "http"
                and self.initial_port == 80
                and parsed.scheme == "https"
                and target_port == 443
            )
            if target_port != self.initial_port and not standard_https_upgrade:
                raise ValueError("cross-port local redirect")
            current = urlsplit(request.full_url)
            if current.scheme == "https" and parsed.scheme == "http":
                raise ValueError("local HTTPS downgrade")
        except ValueError as error:
            message = {
                "non-web redirect": "Blocked non-HTTP redirect",
                "redirect contains credentials": "Blocked redirect containing credentials",
                "cross-host local redirect": "Blocked local cross-host redirect",
                "cross-port local redirect": "Blocked local cross-port redirect",
                "local HTTPS downgrade": "Blocked local HTTPS downgrade",
            }.get(str(error), "Blocked local redirect")
            raise HTTPError(target, 403, message, headers, response) from None
        return super().redirect_request(request, response, code, message, headers, target)


def _is_local_app_request(headers) -> bool:
    allowed_hosts = {"127.0.0.1:8765", "localhost:8765"}
    if headers.get("Host", "").lower() not in allowed_hosts:
        return False
    fetch_site = headers.get("Sec-Fetch-Site", "").lower()
    if fetch_site not in ("", "same-origin", "none"):
        return False

    allowed_origins = {"http://127.0.0.1:8765", "http://localhost:8765"}
    origin = headers.get("Origin")
    if origin is not None:
        return origin in allowed_origins

    referer = headers.get("Referer")
    if referer:
        try:
            parsed_referer = urlsplit(referer)
            referer_origin = f"{parsed_referer.scheme}://{parsed_referer.netloc}".lower()
        except ValueError:
            return False
        return referer_origin in allowed_origins
    # Do not accept requests with no origin, referrer, or trustworthy Fetch
    # Metadata. Otherwise a cross-site page that suppresses its referrer can
    # use this loopback service as a blind proxy for bookmark URLs.
    return fetch_site in ("same-origin", "none")


def _classify_http_error(error: HTTPError) -> dict:
    reason = str(getattr(error, "reason", "") or getattr(error, "msg", ""))
    blocked_redirect_details = {
        "Blocked non-HTTP redirect": "跳转到非网页地址，未继续访问",
        "Blocked redirect containing credentials": "跳转网址含登录信息，未继续访问",
        "Blocked local cross-host redirect": "内网书签跳转到其他主机，未继续访问",
        "Blocked local cross-port redirect": "内网书签跳转到其他端口，未继续访问",
        "Blocked local HTTPS downgrade": "HTTPS 内网书签跳转到 HTTP，未继续访问",
        "Blocked non-public redirect": "网页跳转到内网或非公网地址，未继续访问",
    }
    if reason in blocked_redirect_details:
        return {"kind": "uncertain", "status": error.code, "detail": blocked_redirect_details[reason]}
    kind = "dead" if error.code in (404, 410) else "uncertain"
    return {"kind": kind, "status": error.code, "detail": f"HTTP {error.code}"}


class BookmarkHandler(SimpleHTTPRequestHandler):
    def log_message(self, format: str, *args) -> None:
        path = urlsplit(self.path).path
        if path in ("/api/check", "/api/icon"):
            super().log_message("%s", f"{self.command} {path} [query redacted]")
            return
        super().log_message(format, *args)

    def send_head(self):
        # SimpleHTTPRequestHandler hides dotfiles in directory listings but
        # still serves a directly requested path such as /.git/config. Keep
        # project metadata and local icon-cache entries private in web mode.
        translated = Path(super().translate_path(self.path)).resolve()
        root = Path(self.directory).resolve()
        try:
            relative = translated.relative_to(root)
        except ValueError:
            self.send_error(404, "File not found")
            return None
        if any(part.startswith(".") for part in relative.parts):
            self.send_error(404, "File not found")
            return None
        return super().send_head()

    def _check_link(self, target_url: str) -> dict:
        try:
            parsed = urlsplit(target_url)
            if parsed.scheme not in ("http", "https") or not parsed.hostname:
                return {"kind": "uncertain", "status": 0, "detail": "仅支持 HTTP 或 HTTPS 网址"}
            if parsed.username is not None or parsed.password is not None:
                return {"kind": "uncertain", "status": 0, "detail": "网址含登录信息，已跳过请求；请移除账号信息后再检查"}
            if _is_explicit_local_host(parsed.hostname):
                try:
                    initial_port = parsed.port or (443 if parsed.scheme == "https" else 80)
                except ValueError:
                    return {"kind": "uncertain", "status": 0, "detail": "网址端口无效，已跳过请求"}
                # Local destinations should not leak to a configured HTTP proxy.
                link_opener = build_opener(
                    ProxyHandler({}),
                    LocalBookmarkRedirectHandler(parsed.hostname, parsed.scheme, initial_port),
                )
                open_link = link_opener.open
            else:
                # Public URLs use the same IP-pinned transport as favicon
                # discovery. Each redirect is resolved and pinned again, and
                # redirects to local/private addresses are rejected.
                open_link = open_public_link
            deadline = time.monotonic() + LINK_CHECK_BUDGET

            def remaining_timeout() -> float:
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    raise TimeoutError("timed out")
                return remaining

            req = Request(target_url, headers={
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            })
            req.get_method = lambda: "HEAD"
            try:
                with open_link(req, timeout=remaining_timeout()) as res:
                    return {"kind": "ok", "status": res.status, "detail": f"HTTP {res.status}"}
            except HTTPError as e:
                try:
                    if e.code in (405, 501, 404, 410):
                        req2 = Request(target_url, headers={
                            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                            "Range": "bytes=0-0"
                        })
                        try:
                            with open_link(req2, timeout=remaining_timeout()) as res2:
                                return {"kind": "ok", "status": res2.status, "detail": f"HTTP {res2.status}"}
                        except HTTPError as e2:
                            try:
                                return _classify_http_error(e2)
                            finally:
                                e2.close()
                    return _classify_http_error(e)
                finally:
                    e.close()
        except (URLError, TimeoutError, socket.timeout) as e:
            detail = "连接超时" if "timed out" in str(e).lower() else "网络或权限限制"
            if "Blocked non-public destination" in str(e):
                detail = "网址解析到内网或非公网地址，已跳过请求"
            return {"kind": "uncertain", "status": 0, "detail": detail}
        except Exception:
            return {"kind": "uncertain", "status": 0, "detail": "网络异常"}

    def do_GET(self) -> None:
        parsed = urlsplit(self.path)
        if parsed.path == "/api/check":
            if not _is_local_app_request(self.headers):
                self.send_error(403, "Forbidden")
                return
            url = parse_qs(parsed.query).get("url", [""])[0]
            if not url:
                self.send_error(400, "Missing url")
                return
            data = json.dumps(self._check_link(url)).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(data)
            return

        if parsed.path != "/api/icon":
            super().do_GET()
            return
        if not _is_local_app_request(self.headers):
            self.send_error(403, "Forbidden")
            return
        url = parse_qs(parsed.query).get("url", [""])[0]
        result = find_icon(url) if url else None
        if result is None:
            self.send_response(404)
            # The icon finder keeps negative results for 30 minutes. Do not let
            # the browser cache a miss longer than that and hide a newly-added
            # site icon from subsequent renders.
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", "0")
            self.end_headers()
            return
        data, mime = result
        self.send_response(200)
        self.send_header("Content-Type", mime)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "public, max-age=604800")
        # Icons are fetched from third-party sites and returned under this
        # local app's origin. Keep SVG rendering useful while preventing an
        # icon opened as a document from gaining script or network access.
        self.send_header("Content-Security-Policy", "default-src 'none'; img-src data:; style-src 'unsafe-inline'; sandbox")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(data)


def main() -> None:
    root = Path(__file__).resolve().parent
    handler = partial(BookmarkHandler, directory=str(root))
    # Bind and advertise the same IPv4 loopback address. Some systems resolve
    # "localhost" to ::1 first, while this server intentionally binds only
    # 127.0.0.1; using the literal address avoids a confusing connection miss.
    url = "http://127.0.0.1:8765/"
    try:
        server = ThreadingHTTPServer(("127.0.0.1", 8765), handler)
    except OSError as error:
        try:
            with urlopen(url, timeout=2) as response:
                if "拾页" in response.read(4096).decode("utf-8", errors="ignore"):
                    print(f"拾页已经在运行：{url}")
                    webbrowser.open(url)
                    return
        except OSError:
            pass
        raise SystemExit(f"无法启动：端口 8765 已被其他程序占用。{error}") from error
    with server:
        print(f"拾页已启动：{url}")
        print("保持此窗口打开；按 Ctrl+C 结束。")
        webbrowser.open(url)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main()
