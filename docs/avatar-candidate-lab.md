# Alice Avatar Candidate Lab

This layer separates **generation** from **acceptance**.

A model is not Alice merely because a generator returned a GLB. Every generated body enters as a candidate with provenance and must pass identity and embodiment review before it can become the default.

## Candidate lifecycle

1. Reference material is fixed to the canonical Grok-video identity set.
2. A reconstruction backend produces an asset.
3. The asset is stored under `public/avatars/`.
4. A manifest records generator, source reference, artifact/run provenance and QA state.
5. The app exposes the asset only through an explicit selector such as `?avatar=trellis`.
6. Identity, topology, rigging, facial control and mobile performance are reviewed separately.
7. Only an explicitly approved candidate may later replace the canonical still.

## Backends under investigation

- **ECON / TeCH**: human-specific clothed-body reconstruction, SMPL-X compatible.
- **PSHuman**: human-specific single-image reconstruction, public Space currently returning an error.
- **TRELLIS**: general image-to-3D. Useful as a candidate generator, not identity authority.
- **Duix Avatar / StableAvatar**: 2D/video digital-human layer, useful for face/lip-sync research but not a GLB body source.

## Acceptance dimensions

- identity fidelity
- human anatomy and silhouette
- hair and towel/clothing continuity
- topology and watertightness
- skeleton/skin weights
- facial morphs or VRM expressions
- animation stability
- material/texture fidelity
- WebGL/mobile memory cost
- AR/VR scale and framing
- provenance and reproducibility

No single score promotes a model automatically.
