#!/usr/bin/env python3
"""Run the bookmark gallery on this Mac with no extra dependencies."""

from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import socket
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, urlsplit
from urllib.request import Request, urlopen
import webbrowser

from icon_finder import find_icon


class BookmarkHandler(SimpleHTTPRequestHandler):
    def _check_link(self, target_url: str) -> dict:
        try:
            req = Request(target_url, headers={
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            })
            req.get_method = lambda: "HEAD"
            try:
                with urlopen(req, timeout=8) as res:
                    return {"kind": "ok", "status": res.status, "detail": f"HTTP {res.status}"}
            except HTTPError as e:
                if e.code in (405, 501, 404, 410):
                    req2 = Request(target_url, headers={
                        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                        "Range": "bytes=0-0"
                    })
                    try:
                        with urlopen(req2, timeout=8) as res2:
                            return {"kind": "ok", "status": res2.status, "detail": f"HTTP {res2.status}"}
                    except HTTPError as e2:
                        kind = "dead" if e2.code in (404, 410) else "uncertain"
                        return {"kind": kind, "status": e2.code, "detail": f"HTTP {e2.code}"}
                kind = "dead" if e.code in (404, 410) else "uncertain"
                return {"kind": kind, "status": e.code, "detail": f"HTTP {e.code}"}
        except (URLError, TimeoutError, socket.timeout) as e:
            return {"kind": "uncertain", "status": 0, "detail": "连接超时" if "timed out" in str(e).lower() else "网络或权限限制"}
        except Exception:
            return {"kind": "uncertain", "status": 0, "detail": "网络异常"}

    def do_GET(self) -> None:
        parsed = urlsplit(self.path)
        if parsed.path == "/api/check":
            if self.headers.get("Host") not in ("127.0.0.1:8765", "localhost:8765") or self.headers.get("Sec-Fetch-Site") == "cross-site":
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
        if self.headers.get("Host") not in ("127.0.0.1:8765", "localhost:8765") or self.headers.get("Sec-Fetch-Site") == "cross-site":
            self.send_error(403, "Forbidden")
            return
        url = parse_qs(parsed.query).get("url", [""])[0]
        result = find_icon(url) if url else None
        if result is None:
            self.send_response(404)
            self.send_header("Cache-Control", "public, max-age=3600")
            self.send_header("Content-Length", "0")
            self.end_headers()
            return
        data, mime = result
        self.send_response(200)
        self.send_header("Content-Type", mime)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "public, max-age=604800")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(data)


def main() -> None:
    root = Path(__file__).resolve().parent
    handler = partial(BookmarkHandler, directory=str(root))
    url = "http://localhost:8765/"
    try:
        server = ThreadingHTTPServer(("127.0.0.1", 8765), handler)
    except OSError as error:
        try:
            with urlopen(url, timeout=2) as response:
                if "栖点" in response.read(4096).decode("utf-8", errors="ignore"):
                    print(f"栖点已经在运行：{url}")
                    webbrowser.open(url)
                    return
        except OSError:
            pass
        raise SystemExit(f"无法启动：端口 8765 已被其他程序占用。{error}") from error
    with server:
        print(f"栖点已启动：{url}")
        print("保持此窗口打开；按 Ctrl+C 结束。")
        webbrowser.open(url)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main()
