#!/usr/bin/env python3
"""Run the bookmark gallery on this Mac with no extra dependencies."""

from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import webbrowser
from urllib.parse import parse_qs, urlsplit
from urllib.request import urlopen

from icon_finder import find_icon


class BookmarkHandler(SimpleHTTPRequestHandler):
    def do_GET(self) -> None:
        parsed = urlsplit(self.path)
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
