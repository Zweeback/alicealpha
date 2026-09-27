# Alice Talking Head

Alice can be used as a transparent browser-source layer for BEN & ALICE / news / OBS layouts.

## Browser source

Stable fallback embodiment:

```text
/?embed=talking-head&visual=3d
```

Explicit current GLB candidate:

```text
/?embed=talking-head&visual=3d&avatar=glb
```

The `avatar=glb` form is an explicit candidate selection. It does not promote that asset to canonical status and does not bypass the character-manifest approval gate.

## What the MVP does

- removes the lab, page background, captions and controls
- keeps the WebGL canvas transparent for compositing
- frames Alice as a head-and-shoulders broadcast layer
- drives A/I/U/E/O mouth shapes from current speech energy
- maps compatible GLB morph targets such as `Viseme_AA`, `mouth_OH`, and `jawOpen`
- maps VRM expressions to `aa`, `ih`, `ou`, `ee`, `oh`

This is an audio-reactive realtime approximation. It is not phoneme-exact forced alignment. A later quality pass can replace the timing generator with a phoneme-to-viseme timeline without changing the rendering contract.

## OBS

Use the Alice URL as a Browser Source and enable browser-source transparency. Keep the scene dimensions matched to the intended overlay slot. Cropping/scaling can then be done in the news scene without changing Alice itself.
