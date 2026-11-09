"""本機預覽伺服器：跟 python -m http.server 一樣，但叫瀏覽器不要快取，改完檔案重新整理就會是最新版。
用法：python3 serve.py [port]
"""
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, must-revalidate')
        super().end_headers()


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8767
    handler = partial(NoCacheHandler, directory=str(Path(__file__).parent))
    ThreadingHTTPServer(('', port), handler).serve_forever()
