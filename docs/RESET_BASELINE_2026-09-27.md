# Alice Reset Baseline — 2026-09-27

This file is the reset point for future Alice work. It records only claims verified against the repository or explicitly declared operator constraints.

## Repository anchors

- Canonical repository: `Zweeback/alicealpha`
- Verified `main` head: `20090568aefb84b618cbef4e362f6dcc788c5cbe`
- Active v1 branch: `alice/blindspot-knowledge-kernel-20260926`
- The branch was verified as five commits ahead of `main` before this reset documentation was added.
- PR #73 (`alice/web-intake-20260926`) is open and deliberately excluded from v1.

## Hard operator constraints

- Alice v1 must not require a paid API, a credit card, or a working OpenAI API key.
- `OPENAI_API_KEY` / OpenAI Realtime is an optional enhancement only.
- Core boot, health, CI acceptance, memory, embodiment, local/browser operation and the v1 continue-loop must remain valid without that key.
- High-risk GitHub actions, especially merge, remain human-approved.

## Verified main capabilities

- Node/Express server and Vite/React client.
- WebXR/Three.js embodiment with procedural fallback and GLB/VRM loading.
- Browser-local confirmed memory in `src/core/memory.js`.
- Optional browser-local WebLLM path.
- Optional Ollama HTTP path.
- Optional OpenAI Realtime WebRTC path.
- Stateless MCP HTTP surface.
- Policy/audit primitives for bounded GitHub operator actions.
- Docker/Kubernetes deployment manifests and CI workflows.

## v1 branch additions

The active branch contains:

- `server/runState.js`
- `server/blindspotLedger.js`
- `server/continueAlice.js`
- expanded `server/operatorDispatch.js`
- expanded `server/githubMcpExecutor.js`

These files are implementation work, not proof of an end-to-end autonomous Alice runtime.

## v1 is NOT yet proven

At this reset point:

- `continueAlice.js` is not wired into `server/index.js` or `server/aliceMcp.js`.
- Alice on Render does not have a proven runtime bridge to ChatGPT's connected GitHub tool.
- The new continue/persistence modules do not yet have dedicated tests on this branch.
- File-backed run state is not yet proven durable across Render restarts/deploys.
- There is no open PR for the v1 branch at this reset point.
- The v1 acceptance loop — real diff -> verified green test -> persisted next step — is not yet demonstrated end to end.

## Definition of done for v1

Alice v1 is complete only when a bounded "continue" operation leaves:

1. a real repository diff,
2. a green verification result bound to that diff/head,
3. a persisted next step recoverable after restart,
4. truthful evidence of each transition.

Anything less remains partial implementation.
