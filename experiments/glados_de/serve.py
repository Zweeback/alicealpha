#!/usr/bin/env python3
from functools import partial
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
import os
class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cross-Origin-Opener-Policy", "same-origin")
        self.send_header("Cross-Origin-Embedder-Policy", "require-corp")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Cache-Control", "no-store")
        super().end_headers()
    def guess_type(self,path):
        if path.endswith(".wasm"):return "application/wasm"
        if path.endswith(".onnx"):return "application/octet-stream"
        return super().guess_type(path)
if __name__=="__main__":
    root=Path(__file__).resolve().parent
    port=int(os.environ.get("GLADOS_PORT","8765"))
    server=ThreadingHTTPServer(("127.0.0.1",port),partial(Handler,directory=str(root)))
    print("GLaDOS local-only listening on http://127.0.0.1:"+str(port)+"/",flush=True)
    try:server.serve_forever()
    except KeyboardInterrupt:pass
    finally:server.server_close()
