# GLaDOS voice: verified integration boundary (2026-10-24)

## What this branch changes
Alice already has a GLaDOS button (`src/App.jsx`), audio playback mode (`src/core/voice.js`), and a gated `POST /api/glados-tts` proxy (`server/index.js`). It does **not** bundle a running GLaDOS speech engine.

Previously, the proxy only sent POST/JSON. The R2D2FISH/glados-tts repository actually exposes **GET /synthesize/<percent-encoded text>** in `engine.py`.

This branch adds `server/gladosTransport.js` to distinguish the two upstream transports:
- `ALICE_GLADOS_TTS_URL=http://127.0.0.1:8124/synthesize/`: legacy R2D2FISH GET endpoint.
- `ALICE_GLADOS_TTS_URL=http://127.0.0.1:9000/tts`: existing POST/JSON-compatible sidecar.

No GLaDOS fallback voice is silently substituted if the endpoint fails.

## Deployment dependencies and limitations
- R2D2FISH code: https://github.com/R2D2FISH/glados-tts (MIT source license; check model/dataset rights separately for intended use).
- The referenced weights are **not in the source checkout**. The README links an external model download. Install the model files and compatible Python requirements in an isolated service, not the React/Node frontend.
- `engine.py` exists in that repository. Its README refers to `engine-remote.py`, which is not present in the checked top-level file listing; use the actual file after inspecting prerequisites.
- Set the upstream URL on the Alice server; never embed a publicly exposed model-server URL or secret in the frontend.
- Legacy GET places spoken content in URL paths, which may be captured in access logs. Use a POST/JSON-compatible sidecar for sensitive utterances.
- The code patch was validated with local Node transport assertions; a full model synthesis and browser playback test still requires deployed model weights and an accessible server.
- Neither a configured environment variable nor a healthy Alice HTTP endpoint proves audible GLaDOS playback.

## Verification gates
1. Start a model-backed engine with valid weights on a private, authorized host.
2. Verify it returns nonempty WAV for a known short English sentence.
3. Configure `ALICE_GLADOS_TTS_URL` on the Alice runtime and restart.
4. Check Alice `/api/health` for configuration (not proof of functionality).
5. Call Alice `/api/glados-tts` from an allowed origin and assert WAV bytes/content type.
6. Select GLaDOS in the browser, play one utterance, confirm sound via actual listening.

Test commands when dependencies are installed: `npm run test:run`; or `npx vitest run tests/gladosTransport.test.js`.
