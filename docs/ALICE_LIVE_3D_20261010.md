# Alice live 3D — 2026-10-10

The live 3D renderer is currently hidden by the default portrait selection in `src/xr/avatarCatalog.js`. The existing `tests/avatarCandidate.test.js` expects live 3D by default.

Acceptance: keep approved portrait available via `?visual=portrait`; default to procedural live 3D, and allow explicit unapproved `?avatar=trellis&visual=3d` preview without automatic promotion.

Source reference: user-supplied 10 MP4 clips visually depicting red-haired Alice with blue-green eyes and white towel. Identity similarity and rigging of `alice-trellis.glb` have not been verified.
