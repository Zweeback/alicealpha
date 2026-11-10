# ALICE owner VRM handoff (2026-11-09)

This branch stages **code-only** selectors for owner-provided VRM 1.0 models. The binary assets are **NOT YET COMMITTED TO THIS BRANCH**, and this PR must not be merged as if the Render deployment were complete.

Required paths under `public/avatars/`:
- `Alice_v0.4.vrm` — 6,430,112 bytes, SHA-256 `d27c2e0039aac014f4a3a3dfa2516e959b3b84df384022c984523932b8da28d2`
- `Alice_v0.5.vrm` — 7,013,480 bytes, SHA-256 `869e719e62bc2a308f7da21eed3322e2ccd809f3ad4f1eb38dda4b4ae8b886fe`
- `Alice_v0.5_pc70k.vrm` — 5,637,120 bytes, SHA-256 `dd909fd12e8df64b9dea72fc71ebbc8908dacc9dbd1eb363e4694b95be20bba9`
- `alice_v0.6.vrm` — 9,382,712 bytes, SHA-256 `3c6496d1e26b46ca874453de222089f71bdefd0e92db4af0c5085ff2e54d89c3`

Once uploaded, test `?viewer=vrm&model=v04`, `model=v05`, `model=v05mobile`, `model=v06`; main Alice experience `?avatar=v04&visual=3d`. The existing GLB/procedural fallback and original default stay intact.

**Do not change** `approvedAsset: null` or `canonicalAssetStatus: pending` without separate identity, license, browser/WebGL, mobile and animation verification. Embedded VRM metadata states `allowRedistribution:false` and `avatarPermission:onlyAuthor`. Owner must review distribution before publishing in public repo.

Structural audit: glTF binary 2.0 + VRMC_vrm extension, checksums performed locally. WebGL, visual/identity and live Render HTTP audit: unknown.