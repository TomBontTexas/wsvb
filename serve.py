#!/usr/bin/env python3
"""Static file server for WSVB that disables all caching.

Browsers (iOS Safari especially) can stubbornly cache a plain
`python -m http.server` response even across reloads. This adds
Cache-Control headers so every request always gets the current file.

Usage: py serve.py [port]   (default port 8934)
"""
import sys
import http.server

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8934


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def log_message(self, format, *args):
        # Default logging writes to sys.stderr, which is None when launched
        # via pythonw.exe (no console attached) - that raises and kills the
        # in-progress response. Silently drop instead of crashing requests.
        pass


if __name__ == "__main__":
    http.server.test(HandlerClass=NoCacheHandler, port=PORT, bind="0.0.0.0")
