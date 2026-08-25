# Alice Alpha — contributor rules

## System boundary

Alice v0.2 is an embodied WebXR vertical slice. Keep these layers separate:

1. `server/` owns provider credentials, model selection and the persona/tool contract.
2. `src/core/` owns transport-independent memory, voice, perception and hardware contracts.
3. `src/xr/` owns deterministic frame-rate animation and spatial rendering.
4. React owns minimal experience state, not domain logic.

## Required invariants

- German user-facing language.
- Never expose a provider key to browser code or repository content.
- Every permanent memory requires hash, source and `confirmed` status.
- A model may propose memory; explicit user confirmation is required before persistence.
- Raw camera frames remain local unless a future opt-in feature says otherwise.
- AI emits semantic performance cues; local code owns interpolation and physical limits.
- Any animatronic output must be interruptible and retain `safe_hold` behavior.
- Keep a working local fallback and label it honestly as non-model behavior.

## Do not

- claim Grok, Gemini, OpenAI or another provider is Alice's core identity
- add a multi-model mesh without per-output provenance and failure isolation
- replace `localStorage` without a tested migration path
- infer mental state or medical facts from face/camera signals
- create dependency pressure, exclusivity or deceptive human/conciousness claims

## Verification

```bash
npm run test:run
npm run build
npm run server
```
