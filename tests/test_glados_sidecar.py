"""No torch/model download required for HTTP contract tests."""
import importlib.util
import io
import json
import threading
import unittest
import urllib.error
import urllib.request
import wave
from http.server import ThreadingHTTPServer
from pathlib import Path

MODULE_PATH = Path(__file__).resolve().parents[1] / "tools" / "glados_tts_sidecar.py"
spec = importlib.util.spec_from_file_location("glados_tts_sidecar", MODULE_PATH)
sidecar = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sidecar)


class FakeAudio:
    def export(self, target, format):
        assert format == "wav"
        with wave.open(target, "wb") as file:
            file.setnchannels(1)
            file.setsampwidth(2)
            file.setframerate(22050)
            file.writeframes(b"\\x00\\x00" * 200)


class FakeRunner:
    def __init__(self):
        self.received = []

    def run_tts(self, text):
        self.received.append(text)
        return FakeAudio()


class SidecarContractTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.runner = FakeRunner()
        sidecar.GladosHandler.runner = cls.runner
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), sidecar.GladosHandler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.url = "http://127.0.0.1:" + str(cls.server.server_port)

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join(timeout=2)

    def post(self, payload):
        request = urllib.request.Request(
            self.url + "/tts",
            json.dumps(payload).encode("utf-8"),
            {"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(request) as response:
                return response.status, response.headers.get_content_type(), response.read()
        except urllib.error.HTTPError as error:
            return error.code, error.headers.get_content_type(), error.read()

    def test_health(self):
        with urllib.request.urlopen(self.url + "/health") as response:
            self.assertTrue(json.load(response)["ok"])

    def test_wav_response(self):
        status, media_type, body = self.post({"text": "Hello, test subject."})
        self.assertEqual(status, 200)
        self.assertEqual(media_type, "audio/wav")
        self.assertTrue(body.startswith(b"RIFF"))
        self.assertEqual(self.runner.received[-1], "Hello, test subject.")

    def test_bad_input_rejected(self):
        self.assertEqual(self.post({"text": ""})[0], 400)
        self.assertEqual(self.post({"text": "x" * 1601})[0], 413)


if __name__ == "__main__":
    unittest.main()
