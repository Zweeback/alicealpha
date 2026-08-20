# Alice Alpha

**Status:** active vertical slice · v0.1  
**Type:** Companion AI / local-first prototype  
**Canonical repo:** `Zweeback/alicealpha`

Alice Alpha is the active prototype of Alice OS: Presence, German chat, persistent memory with provenance, Tribunal, graph view and backend settings. The core is model-independent; the current v0.1 backend is local only.

## Run

```bash
python3 -m http.server 8080
# open http://localhost:8080
```

`Alice-OS-v0.1.html` is also provided as a standalone snapshot.

## Current capabilities

| Area | v0.1 |
| --- | --- |
| Presence | Avatar state, emotion and modes |
| Chat | German UI, hints, memory pin, browser STT hook |
| Memory | Confirmed entries with hash/source provenance |
| Tribunal | Confirm / correct / reject candidate memories |
| Graph | Core / runtime / presence / data + memory nodes |
| Settings | Local backend active; cloud backends declared but not wired |

## Architecture rule

`Observation → Retrieval → Response → Candidate → Tribunal → Persist`

Only confirmed memories are allowed back into persistent context.

## Honesty / non-claims

- No cloud LLM is connected in v0.1.
- Memory is stored in this browser's `localStorage`.
- Grok, ChatGPT, Gemini and other backends are planned adapters, not the core.

## Repository map

- `index.html` — modular application entry
- `Alice-OS-v0.1.html` — standalone snapshot
- `css/alice.css` — UI styling
- `js/core.js` — model-independent core and local reply kernel
- `js/memory.js` — local memory/provenance persistence
- `js/app.js` — UI/application wiring
- `ROADMAP.md` — next milestones
- `AGENTS.md` — rules for human/AI contributors

## Next milestone

v0.2: real backend adapter, account-backed persistence, Drive/GitHub provenance sources, TTS and richer presence assets.

## Portfolio status

Keep this repository as the canonical Alice implementation. The older `aliceneu` repository should not be developed in parallel; migrate useful material here and archive/redirect it afterward.
