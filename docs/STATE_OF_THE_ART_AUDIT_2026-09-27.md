# State-of-the-Art Audit — alicealpha — 2026-09-27

This audit separates repository evidence from narrative or external-project context.

## Current repository state

Verified `main` head: `20090568aefb84b618cbef4e362f6dcc788c5cbe`.

The current stack is primarily JavaScript/Node/React/Three.js. The verified `main` tree contains no Python files.

## Runtime boundary

`server/index.js` exposes:

- `/mcp`
- `/api/health`
- `/api/alice`
- `/api/local/respond` for optional Ollama
- `/api/realtime/session` for optional OpenAI Realtime
- static production assets

The server can become healthy without `OPENAI_API_KEY`. Realtime is separately reported as configured/operational.

## Important auth/health discrepancy

`.github/workflows/live-health.yml` currently requires:

- `"ok":true`
- `"realtimeConfigured":true`
- the exact deployed revision

This is inconsistent with the documented MVD rule that Alice must remain acceptable without an OpenAI key.

Also, `realtimeConfigured` only proves that `OPENAI_API_KEY` is non-empty. It does not prove that the credential authenticates, has quota, or can complete a Realtime session.

Therefore "Live Deploy Health = success" must not be interpreted as "OpenAI Realtime works".

## Current CI evidence

For `main` SHA `20090568...`, GitHub Actions showed:

- CI: success
- Container: success
- Live Deploy Health: success
- Release Audit: success
- Live Browser WebRTC: failure

Therefore the claim that the current repository is in a system-wide CI collapse is false for the verified current main revision.

The latest failed Live Browser job completed checkout, install, build, local server startup, Playwright installation and Chromium installation successfully. The failure occurred specifically at `Run live browser WebRTC probe`. A root cause such as STUN/TURN failure must not be asserted without the failing assertion/log evidence.

A direct external probe of the public Render health endpoint on 2026-09-27 returned HTTP 503. That observation does not by itself identify the cause.

## Actual Memory Tribunal implementation

`src/core/memory.js` implements:

- candidate memories,
- SHA-256 over normalized `source:value`,
- explicit confirm/reject transitions,
- browser `localStorage` persistence.

The current implementation does NOT require the LLM to reproduce the exact source-document SHA-256 before confirmation, and it does NOT automatically label unverifiable candidates as "sycophancy" or "hallucination".

Those stronger claims are architectural narrative, not current code behavior.

## Governance

`AGENTS.md` exists and defines repository boundaries and invariants, including:

- credentials stay server-side,
- permanent memory requires hash/source/confirmed status,
- explicit user confirmation for persistence,
- raw camera frames remain local,
- local fallback must remain available,
- tests/build/server verification.

The current `AGENTS.md` does not implement a `state.md` finite-state blackboard, D-R-A-S execution protocol, or `SOUL_MASTER_PROMPT.md` override chain.

## Avatar/XR evidence

Verified historical PRs:

- PR #8 merged GLB/VRM loading with procedural fallback and `@pixiv/three-vrm`.
- PR #12 merged explicit flat-slice detection and fallback for TripoSR-like artifacts.
- PR #47 merged a TRELLIS candidate lab, artifact provenance, selection and smoke-test workflows.
- PR #68 merged the character-manifest gate.
- PR #69 merged the minimal viable deployment layer.

PR #47 should be described as a candidate-lab/promotion workflow, not generically as proof that a production TRELLIS avatar was approved.

## External systems not present in current repo

The verified `main` tree does not contain:

- `state.md`
- `SOUL_MASTER_PROMPT.md`
- `BLINDSPOT_WAFFE.md`
- `TRIBUNAL_KI_VERHALTEN.md`
- `codex_auto_loop.py`
- `alice_autoloop.py`
- `codex.yaml`
- `alice_autoloop.db`
- `build_alice_rag_bundle_v2.py`
- `alice_conversations_clean.jsonl`
- AURA worker files (`streamer.py`, `zip_scanner.py`, `chat_worker.py`, `multimodal.py`, `coordinator.py`)
- ChromaDB/Qdrant/FAISS implementation files

These may exist in other repositories, Drive archives, historical workspaces or reports, but they must not be described as components of the current `alicealpha` repository without separate evidence.

## Spatial/Dortmund integration

The repository contains a reference to `dortmundgamemap` in `resources/github-links.md`. A link/reference is not evidence of a live runtime coupling, capability bus, or deployed spatial-memory integration.

## Current v1 gap

The main architectural gap is not lack of another framework. It is execution closure:

`intent -> bounded operation -> real effect -> verification -> durable state -> resumable next step`

The active v1 branch begins implementing this loop but has not yet demonstrated it end to end.
