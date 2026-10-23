#!/usr/bin/env python3
"""Loopback-only JSON-to-WAV adapter for R2D2FISH/glados-tts.

Install and provide that project's separately distributed models before starting.
This adapter does not download models, clone voices or expose an Internet service.
"""
import io
import json
import os
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

MAX_REQUEST_BYTES = 8192
MAX_TEXT_CHARS = 1600


def load_runner(source_directory: str):
    root = Path(source_directory).expanduser().resolve()
    required = (
        "glados.py",
        "models/glados-new.pt",
        "models/vocoder-gpu.pt",
        "models/emb/glados_p2.pt",
    )
    missing = [name for name in required if not (root / name).is_file()]
    if missing:
        raise FileNotFoundError(
            "GLaDOS engine/models missing in " + str(root) + ": " + ", ".join(missing)
        )

    # Upstream resolves both its torch models and phonemizer data against cwd.
    os.chdir(root)
    sys.path.insert(0, str(root))
    from glados import tts_runner  # noqa: PLC0415

    return tts_runner(False, True)


class GladosHandler(BaseHTTPRequestHandler):
    runner = None
    synthesis_lock = threading.Lock()

    def reply_json(self, code: int, payload: dict):
        encoded = json.dumps(payload).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)

    def do_GET(self):
        if self.path != "/health":
            self.reply_json(404, {"error": "not-found"})
            return
        self.reply_json(200, {"ok": self.runner is not None, "provider": "glados"})

    def do_POST(self):
        if self.path != "/tts":
            self.reply_json(404, {"error": "not-found"})
            return
        if self.headers.get_content_type() != "application/json":
            self.reply_json(415, {"error": "json-required"})
            return
        try:
            size = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            self.reply_json(400, {"error": "invalid-length"})
            return
        if not 1 <= size <= MAX_REQUEST_BYTES:
            self.reply_json(413, {"error": "invalid-request-size"})
            return
        try:
            data = json.loads(self.rfile.read(size))
        except (ValueError, UnicodeDecodeError):
            self.reply_json(400, {"error": "invalid-json"})
            return
        if not isinstance(data, dict):
            self.reply_json(400, {"error": "json-object-required"})
            return
        voice_text = data.get("text")
        if not isinstance(voice_text, str) or not voice_text.strip():
            self.reply_json(400, {"error": "missing-text"})
            return
        voice_text = voice_text.strip()
        if len(voice_text) > MAX_TEXT_CHARS:
            self.reply_json(413, {"error": "text-too-long"})
            return
        if self.runner is None:
            self.reply_json(503, {"error": "tts-model-not-loaded"})
            return
        try:
            with self.synthesis_lock:
                stream = io.BytesIO()
                self.runner.run_tts(voice_text).export(stream, format="wav")
                wav = stream.getvalue()
            if not wav.startswith(b"RIFF") or len(wav) < 44:
                self.reply_json(502, {"error": "invalid-wav"})
                return
        except Exception:
            self.log_error("GLaDOS inference failed")
            self.reply_json(502, {"error": "tts-inference-failed"})
            return
        self.send_response(200)
        self.send_header("Content-Type", "audio/wav")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(wav)))
        self.end_headers()
        self.wfile.write(wav)


def main():
    source = os.environ.get("GLADOS_TTS_DIR", "./glados-tts")
    GladosHandler.runner = load_runner(source)
    host = os.environ.get("ALICE_GLADOS_BIND", "127.0.0.1")
    port = int(os.environ.get("ALICE_GLADOS_PORT", "8124"))
    if host not in ("127.0.0.1", "::1", "localhost"):
        raise ValueError("GLaDOS sidecar must be bound to loopback")
    server = ThreadingHTTPServer((host, port), GladosHandler)
    print("GLaDOS TTS available on http://" + host + ":" + str(port) + "/tts", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
