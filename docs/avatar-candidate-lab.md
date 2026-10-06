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

## Registered FBX source candidate

- `public/avatars/candidates/model.fbx`
- SHA-256: `da4e5c3bc65b21bdbf9c73c2651df81a645bb315d747c2d9383aa0da025e4c59`
- State: **candidate only**. It must be converted/validated against the existing promotion gate before it can become Alice's canonical runtime asset.

## Reproducible rigged browser candidate

`npm run asset:convert-fbx` converts the registered source into
`public/avatars/alice-rigged.glb` and writes machine-readable evidence to
`public/avatars/alice-rigged.json`.

Observed contract:

- 8 skinned meshes
- 73 bones, including head, eyes, spine, arms, hands, legs and feet
- 66 facial/mouth targets, including bilateral blink, jaw opening, smile and
  `aa`/`ih`/`oh`/`ou` visemes
- deterministic output SHA-256
- 1.1 MB Meshopt-compressed GLB

Open `?avatar=rigged` to exercise the candidate. The runtime binds gaze, head,
arms, blink, mouth opening, smile and speech energy while retaining the
procedural Alice as fail-closed default/fallback.

The current conversion intentionally replaces embedded FBX textures with
neutral materials because the Node conversion path has no browser image
decoder. Identity and materials therefore remain unapproved; this result proves
embodiment and interaction, not canonical visual identity.
