# Alice Alpha

**Status:** active embodied vertical slice · v0.2  
**Type:** Companion AI / WebXR / Realtime Voice  
**Canonical repository:** `Zweeback/alicealpha`

**Public full-stack preview:** [alicealpha.onrender.com](https://alicealpha.onrender.com)

Alice Alpha is a live German 3D persona for desktop, mobile AR and VR. The cloud model handles language, conversational intent and high-level performance direction. The local Three.js runtime renders gaze, facial motion, gestures and body movement smoothly at device frame rate.

## What works

- live speech-to-speech conversation over WebRTC using OpenAI Realtime
- procedural full-body 3D Alice with gaze, blink, mouth, posture and six gesture families
- camera-derived user presence and coarse expression; raw camera frames stay in the browser
- immersive WebXR AR placement and a VR laboratory
- explicit, provenance-aware memory Tribunal: `candidate → confirmed | rejected`
- persistent local girl-companion livechat layered over text, local AI and Realtime voice
- browser speech/text fallback when the cloud channel is unavailable
- optional hyperreal neural TTS sidecar with browser speech fallback
- optional Web Serial performance-plan bridge for a later animatronic body
- installable PWA shell and responsive, menu-free German interface

## Runtime

Node.js 22 or newer is recommended.

```bash
npm install
npm run build
npm run server
# open http://localhost:8787
```

Development uses two processes:

```bash
npm run server
npm run dev
# open the Vite URL; /api is proxied to port 8787
```

GitHub Codespaces is configured in `.devcontainer/devcontainer.json`. It installs dependencies, forwards Vite on `5173` and the Realtime server on `8787`, and offers GitHub Copilot/Copilot Chat when those services are enabled for the signed-in GitHub account.

`OPENAI_API_KEY` belongs in `.env.local` or the deployment host's secret store. It is used only by `server/index.js` and is never bundled into the browser.

The Render preview is deployed from `main` in Frankfurt. Until `OPENAI_API_KEY` is entered directly in the Render service's secret environment, it intentionally reports `realtime: false` and uses the browser fallback; the key is never copied through GitHub or the public client. GitHub Pages remains an optional manual workflow because a static host cannot run the secret-holding session endpoint.

Optional environment variables:

```dotenv
OPENAI_REALTIME_MODEL=gpt-realtime-2.1
OPENAI_REALTIME_VOICE=marin
PORT=8787
```


## Girl Companion livechat + neural voice

The text fallback is now a real persistent companion chat instead of a one-shot caption box. The last 80 local messages survive reloads in browser storage, while the compact `companion_state` sent to model backends still contains only continuity counters — chat content is not silently added to that payload.

For a local hyperreal voice, Alice can use the bundled Chatterbox Multilingual V3 sidecar. Use only a voice reference you own or have permission to use.

```bash
python -m venv .venv-tts
. .venv-tts/bin/activate
pip install -r requirements-tts.txt

export ALICE_VOICE_REFERENCE=/absolute/path/to/reference.wav
python tools/alice_tts_sidecar.py
```

Then point the Node app at it:

```dotenv
ALICE_TTS_URL=http://127.0.0.1:8799/tts
ALICE_TTS_PROVIDER=chatterbox
ALICE_TTS_LANGUAGE=de
```

When the sidecar is healthy, local Alice replies use neural audio. If it is unavailable, the existing browser TTS remains the fallback. OpenAI Realtime speech-to-speech remains unchanged.

## Live control loop

`Microphone → WebRTC model → transcript/audio + tool calls → AliceWorld → 60/90 FPS embodiment`

The model calls `drive_avatar` with dialogue act, emotion, gesture, gaze, intensity and duration. It never controls bones frame by frame. The renderer interpolates high-level cues locally and uses the real return-audio energy for mouth motion.

Camera presence is reduced locally to a small observation such as horizontal position, distance and visible expression. It is explicitly treated as uncertain context, not as an emotional diagnosis.

## Memory rule

`Observation → Response → Candidate → Tribunal → Persist`

Every memory carries a SHA-256 hash, source and status. A model tool may only propose a candidate. A second tool may confirm or reject it after the user gives an explicit decision.

## Repository map

- `src/App.jsx` — minimal embodied experience wiring
- `src/xr/AliceWorld.js` — Three.js/WebXR body and animation runtime
- `src/core/realtime.js` — browser WebRTC and Realtime event boundary
- `src/core/vision.js` — local MediaPipe camera presence
- `src/core/memory.js` — provenance-aware local memory and Tribunal
- `src/core/animatronic.js` — Web Serial safety bridge
- `server/index.js` — secret-holding Realtime session endpoint
- `server/alicePrompt.js` — persona contract and tool schemas
- `tests/` — memory, safety, persona and protocol tests
- `docs/REALTIME_ARCHITECTURE.md` — exact communication architecture
- `docs/ORCHESTRATION.md` — GitHub/Codespaces and external research/source worker boundaries
- `docs/CONNECTOR_AUDIT.md` — tested connector reachability and authorization status
- `server/sourceArtifact.js` — provenance and credential boundary for external research/library records
- `design-qa.md` — evidence-based visual acceptance status

## Avatar Asset Look Target

The intended asset look for Alice is **towel-Alice (red hair, blue eyes, white towel, photoreal)**, referencing concepts from Grok Imagine. When the asset is ready, drop it as `alice.glb` or `alice.vrm` in the `public/` directory.

## Studio asset handoff

Alice can now receive a candidate avatar directly from the shared 3D/film studio output without silently promoting it to canonical:

```bash
npm run asset:import -- \
  --source /path/to/published/alice.glb \
  --provenance "DortmundGameMap studio pipeline"
```

The importer:

- accepts only `.glb` or `.vrm`;
- copies the file into `public/alice.glb` or `public/alice.vrm`;
- computes SHA-256;
- updates `ALICE_CHARACTER_MANIFEST.json` as a **candidate**;
- preserves the explicit promotion gate and procedural fallback.

Use `--dry-run` to inspect the handoff without changing files.

## Honest limits

- The current character mesh is procedural (with a GLB/VRM loader fallback), not yet the final sculpted/rigged Alice asset.
- Browser camera tracking is intentionally coarse; raw video is not sent to the model by this implementation.
- GitHub Pages can host the offline/PWA client, but live AI requires the Node server on a host with `OPENAI_API_KEY`.
- Relationship continuity currently persists in browser storage; account synchronization and encrypted remote storage remain future work.
- GitHub is connected for source control. Codespaces and Copilot are configured at repository level. Jules, Gemini, NotebookLM, SuperGrok, DigiBib and ScriptDB have defined handoff contracts but are not callable connectors in this session.

The older `aliceneu` repository should not be developed in parallel. Migrate useful material here and archive or redirect it afterward.


## Alice Live Studio v2

Open `?studio=news` for the clean newsroom runtime. It is a real Three.js/VRM scene, not an image: procedural Alice has a restrained news-anchor updo, idle motion, pointer gaze, expressions, gestures, browser TTS and A/I/U/E/O lip-sync. Candidate assets can replace the fallback via `/alice-news.vrm`, `/alice-news.glb`, `/alice.vrm` or `/alice.glb`.
