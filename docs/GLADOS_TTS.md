# GLaDOS voice for ALICE

The existing **GLaDOS** mode in `src/App.jsx` uses `POST /api/glados-tts` in the ALICE Express server. That endpoint now connects to a local JSON-to-WAV adapter at `POST http://127.0.0.1:8124/tts`; it is not an API to ChatGPT's own voice settings.

## Install the actual synthesis engine

Use [R2D2FISH/glados-tts](https://github.com/R2D2FISH/glados-tts) (MIT-licensed application code, Forward Tacotron and HiFiGAN). The model binaries are *not* included in this repository and must be obtained according to the model distributor's terms.

```bash
git clone https://github.com/R2D2FISH/glados-tts.git
cd glados-tts
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
# Follow the upstream README to download/unpack the model archive into ./models
# Verify models/glados-new.pt, models/vocoder-gpu.pt and models/emb/glados_p2.pt exist.
cd ../alicealpha
GLADOS_TTS_DIR=../glados-tts python3 tools/glados_tts_sidecar.py
```

The adapter binds to **127.0.0.1:8124** by default and exposes `GET /health` and `POST /tts` with `{"text":"Hello."}`. It returns `audio/wav`, refuses oversized input, and serializes model inference. It refuses to start if the required model assets are absent; it does not fabricate audio.

Set in the ALICE server environment:

```dotenv
ALICE_GLADOS_TTS_URL=http://127.0.0.1:8124/tts
ALICE_GLADOS_TTS_TIMEOUT_MS=90000
```

Run `npm run server` separately, then open the ALICE UI and choose **GLaDOS**. GLaDOS synthesis is English-focused; German input may sound incorrect. The source repository may require version-specific Python/PyTorch dependencies. Heavy inference can require a more capable machine than a phone. On hosted deployments, `127.0.0.1` is **the host/container running the Node backend**, not the user's computer; the sidecar must run in the same accessible network environment. Do not expose the model sidecar to the public Internet.

## Verification

```bash
python3 -m unittest discover -s tests -p 'test_glados_sidecar.py' -v
npm run test:run
curl -sS http://127.0.0.1:8124/health
curl -sS -o /tmp/alice-glados.wav \
  -H 'content-type: application/json' \
  -d '{"text":"Hello, test subject."}' http://127.0.0.1:8124/tts
file /tmp/alice-glados.wav
```

The Python tests use a **fake audio generator only for the HTTP contract**. They **do not establish** that the actual GLaDOS model has been installed or auditioned. In the UI, when the GLaDOS engine is missing, the failure is shown explicitly and a standard browser voice is no longer falsely substituted for GLaDOS.

**Rights note:** MIT licensing of adapter/engine code does not automatically grant commercial rights to a game's character, brand, performance samples, or separately distributed trained model. Check asset licenses before redistribution.
