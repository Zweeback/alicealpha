# Copilot instructions for Alice Alpha

Follow `AGENTS.md` and preserve the server/core/XR boundaries.

- Keep user-facing language German.
- Never add provider secrets to browser code, commits, fixtures, logs or screenshots.
- Treat Alice as one coherent persona. Do not expose a multi-model panel or provider branding in the experience.
- Models emit semantic gaze, emotion and gesture cues; `AliceWorld` owns frame-level movement and interpolation.
- Raw camera frames remain local. Only uncertain, coarse presence observations may enter model context.
- A model may propose memory, but persistence requires a hashed record and explicit user confirmation through the Memory Tribunal.
- Preserve interruption, `safe_hold` and finite motion envelopes for all animatronic work.
- Keep the experience low-chrome: no dashboard, menu wall or decorative controls around the avatar.
- Add or update tests for protocol, memory, persona or safety contract changes.
- Run `npm run test:run` and `npm run build` before proposing a pull request.

External work from Jules, Gemini, NotebookLM, SuperGrok, DigiBib, ScriptDB or library portals must conform to `docs/ORCHESTRATION.md` and retain provenance. ScriptDB is a library/form/database source, never a screenplay source.
