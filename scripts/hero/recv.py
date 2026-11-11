# 本機接收器：瀏覽器把匯出的 GLB POST 過來存到這個資料夾；GET 提供 exp 模組（加 CORS）
import sys, os
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs
D = os.path.dirname(os.path.abspath(__file__))
class H(SimpleHTTPRequestHandler):
    def __init__(s, *a, **k): super().__init__(*a, directory=D, **k)
    def end_headers(s):
        s.send_header("Access-Control-Allow-Origin", "*"); s.send_header("Access-Control-Allow-Headers", "*"); s.send_header("Cache-Control", "no-store"); super().end_headers()
    def do_OPTIONS(s): s.send_response(204); s.end_headers()
    def do_POST(s):
        name = os.path.basename(parse_qs(urlparse(s.path).query).get("name", ["out.bin"])[0])
        data = s.rfile.read(int(s.headers["Content-Length"]))
        open(os.path.join(D, name), "wb").write(data)
        s.send_response(200); s.end_headers(); s.wfile.write(f"saved {name} {len(data)}".encode())
ThreadingHTTPServer(("127.0.0.1", 8799), H).serve_forever()
