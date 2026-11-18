#!/usr/bin/env python3
"""HTTP 206 Byte-Range local server for Goldberg Variations Interactive Architecture Lab."""
import http.server
import os
import re
import socketserver
import sys


class RangeFileWrapper:
    def __init__(self, f, length):
        self.f = f
        self.remaining = length

    def read(self, size=-1):
        if self.remaining <= 0:
            return b""
        chunk = self.f.read(self.remaining if size < 0 else min(size, self.remaining))
        self.remaining -= len(chunk)
        return chunk

    def close(self):
        self.f.close()


class RangeHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def send_head(self):
        path = self.translate_path(self.path)
        if os.path.isdir(path):
            return super().send_head()
        if not os.path.exists(path):
            self.send_error(404, "File not found")
            return None

        range_header = self.headers.get("Range")
        size = os.path.getsize(path)
        ctype = self.guess_type(path)

        if not range_header:
            self.send_response(200)
            self.send_header("Content-type", ctype)
            self.send_header("Content-Length", str(size))
            self.send_header("Last-Modified", self.date_time_string(os.path.getmtime(path)))
            super().end_headers()
            return open(path, "rb")

        m = re.match(r"bytes=(\d+)-(\d*)", range_header)
        if not m:
            self.send_error(416, "Requested Range Not Satisfiable")
            return None

        start = int(m.group(1))
        end = int(m.group(2)) if m.group(2) else size - 1
        if start >= size or end >= size or start > end:
            self.send_response(416)
            self.send_header("Content-Range", f"bytes */{size}")
            super().end_headers()
            return None

        length = end - start + 1
        self.send_response(206)
        self.send_header("Content-type", ctype)
        self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        self.send_header("Content-Length", str(length))
        self.send_header("Last-Modified", self.date_time_string(os.path.getmtime(path)))
        super().end_headers()

        f = open(path, "rb")
        f.seek(start)
        return RangeFileWrapper(f, length)


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("", port), RangeHTTPRequestHandler) as httpd:
        print(f"🎹 Goldberg Variations Lab running at http://localhost:{port}/ (HTTP 206 Range Enabled)")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nShutting down server.")


if __name__ == "__main__":
    main()
