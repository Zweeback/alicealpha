# ALICE Character Lab — real 3D assets and CORVUS 01 handoff

**Date:** 2026-10-19  
**Repository:** [Zweeback/alicealpha](https://github.com/Zweeback/alicealpha)  
**Status:** feature branch; do not promote to canonical ALICE automatically.

## What is present in GitHub now

- `public/corvus/index.html` is a phone-friendly entrypoint for the existing React/Three.js VRM viewer.
- The embedded viewer loads the **real committed binary VRM models**:
  - `public/avatars/alice-designsheet-candidate.vrm` — 15,372,376 bytes, 157 meshes, 54 humanoid bones (according to committed audit).
  - `public/avatars/alice-fbx-source.vrm` — 14,609,576 bytes, 8 meshes, 54 humanoid bones (according to committed audit).
- The existing viewer supports free camera movement, preset expressions, screenshots, and importing local `.glb` or `.vrm` files.
- Neither candidate passed visual identity matching or browser-animation verification in the committed audits.

## CORVUS 01 — separate locally generated prototype

In the 2026-10-19 ChatGPT session a new adult-proportioned, stylized horror-inspired mesh was generated as
`ALICE_CORVUS_01_horror_prototype.glb`.

Locally verified characteristics:

| Property | Value |
|---|---|
| Format | glTF 2.0 binary |
| File size | 800,820 bytes |
| Meshes | 178 |
| Vertices | 25,180 |
| Triangles | 49,648 |
| Rigged | No |
| Animated | No |
| Photorealistic | No |
| VRM | No |
| SHA-256 | `ee94dffaa6334594c0fcd2f5d935e27aa98172002b254fa9a9166a6be4c3ef16` |

**Binary upload status: not uploaded to GitHub.** The GitHub connector in this chat supports text file writes but cannot read the local sandbox binary to supply its upload payload. Do not confuse the in-repository VRM candidates with the new CORVUS mesh.

To import that exact local file after downloading the session artifact:

```bash
mkdir -p public/corvus/assets
cp ALICE_CORVUS_01_horror_prototype.glb public/corvus/assets/
sha256sum public/corvus/assets/ALICE_CORVUS_01_horror_prototype.glb
git add public/corvus/assets/ALICE_CORVUS_01_horror_prototype.glb
git commit -m "assets(corvus): add verified CORVUS 01 glb"
git push
```

Only proceed if the hash equals the SHA-256 above. You may also open the GLB **without committing it** using the existing viewer's `Eigene .vrm / .glb öffnen` picker.

## Launch

Run the project's usual Vite app:

```bash
npm ci
npm run dev
```

Then open `http://localhost:5173/corvus/index.html`. The VRM viewer is served at `/?viewer=vrm&model=designsheet`.

For a production deployment with a base path, open `<deployment-base>/corvus/index.html` under that same site; the launcher uses relative URLs for both models and the viewer.

## Next quality gates

1. Import CORVUS GLB into Blender, inspect geometry, normals, topology, UVs and materials.
2. Add an armature and skinning, humanoid rig, facial blendshapes and test movements.
3. Export to VRM 1.0 using a compatible Blender VRM add-on and verify in the browser.
4. Optimize texture sizes and mobile frame rate on Pixel 9a.
5. Compare anatomy, identity and provenance with the approved ALICE reference before allowing any canonical replacement.
