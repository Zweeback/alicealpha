# Alice v0.3 Character Pipeline

Alice's runtime and Alice's identity are separate concerns.

The runtime may render a procedural body, a GLB, or a VRM. Only an asset explicitly promoted by the character manifest may be treated as canonical Alice.

## Identity authority

1. Original Grok/Alice video frames are the visual identity authority.
2. `ALICE_SOURCE_REFSET_v2` is the curated source-reference set.
3. Generated multi-view images are derivatives and must not silently replace source frames.
4. Reconstructed GLB/VRM files are candidates until they pass the asset gate.
5. A canonical promotion is a versioned approval event, not a filename overwrite.

## Pipeline

```text
original Grok MP4s
  -> curated source frames
  -> ALICE_SOURCE_REFSET_v2
  -> master + validated multi-view
  -> 3D reconstruction candidate
  -> retopo / rig / facial targets
  -> GLB or VRM candidate
  -> manifest validation
  -> visual + rig + viseme QA
  -> explicit canonical promotion
  -> runtime default
```

## Runtime states

The runtime reads `/ALICE_CHARACTER_MANIFEST.json`.

- `pending`: no generated 3D asset is Alice by default.
- `candidate`: asset may be tested, but is not canonical.
- `canonical`: approved asset may become the default runtime asset.

Until canonical promotion, the runtime uses the procedural body by default.

Debug/test overrides remain available:

```text
?avatar=glb
?avatar=vrm
?procedural=1
```

An explicit GLB/VRM test override is reported as non-canonical.

## Required rig contract

The manifest declares the minimum humanoid skeleton expected by the runtime. The initial contract includes hips, spine/chest, neck/head, arms/hands and legs/feet.

## Required facial contract

Minimum targets:

- blink
- jawOpen
- smile
- A / I / U / E / O

The v0.3 contract is intentionally small. A later revision may map a larger ARKit-style expression set.

## Validation

Run locally:

```bash
npm ci
npm run validate:character
npm run test:run
npm run build
```

The dedicated GitHub Actions workflow reruns the character contract when the manifest, asset-gate code, runtime asset selection, tests or canonical asset slots change.

## Promotion checklist

Before changing `canonical_asset.status` to `canonical`:

- source reference set revision is fixed
- candidate came from the approved Alice multi-view pipeline
- body proportions and depth are plausible
- humanoid rig contract is satisfied
- required facial expressions/visemes are present
- asset renders correctly on desktop/mobile
- Quest/WebXR smoke test is completed
- identity comparison against source references is accepted
- final file SHA-256 is recorded
- approval timestamp is recorded

If any gate fails, Alice remains procedural by default. The runtime must not silently substitute a different face or body.
