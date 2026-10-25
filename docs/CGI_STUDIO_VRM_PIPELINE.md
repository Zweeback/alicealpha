# ALICE CGI Studio — VRM technical-art intake

## Goal

Build a production-grade Alice character pipeline inspired by game-studio review practice. This does **not** claim association with Valve or achieved Valve-equivalent asset quality. Keep `Zweeback/alicealpha` as the runtime of record; this branch introduces validation only, not a replacement avatar.

## Departments and evidence

| Stage | Deliverable | Evidence gate |
| --- | --- | --- |
| Character art | Sculpt, proportions, shader and UV design | Front, profile, back, close-ups compared with approved references |
| Rigging | Skinned VRM humanoid | Confirm every required humanoid bone, deform shoulders/elbows/fingers/knees |
| Facial performance | Blink, vowels, expression shapes | Render actual mesh deformation, not just metadata |
| Animation | Idle, head turns, expressive gestures | Playback capture, no mesh penetration |
| Technical art | LOD, shaders, spring bones, materials | Pixel 9a frame timings, GPU memory and thermal monitoring |
| Runtime | Three.js / `@pixiv/three-vrm` and WebXR | Load, render, voice response, interaction and cleanup |
| Release QA | Source proof, rights, SHA-256, approval | Owner-signed canonical promotion; no silent replacements |

## How to run

```bash
npm run test:asset
npm run studio:vrm-audit -- /absolute/path/to/alice_researcher.vrm
npm run asset:import -- --source /absolute/path/to/alice_researcher.vrm --provenance "private researcher candidate" --dry-run
```

Do not commit the private VRM to a public branch. `--dry-run` checks the importer without replacing public content; the candidate is not canonical. Only import files that have a clear source license and explicit owner approval.

## Intake findings for local Alice researcher candidate

The source binary was analyzed locally (not pushed to GitHub). Evidence checksum:

`07c97c5be021dd1496c7581ff1c4e309b8da1ad0b85069913cb3ac3ea27c445b`

- VRM 1.0 / glTF 2.0, 1,535,660 bytes.
- 38,373 triangles, 2 meshes, 1 skin, 84 nodes.
- Humanoid bone mapping and 5 vowel presets present.
- 12 unique named facial morphs, VRM spring-bone extension present.
- No embedded animation clips, no embedded texture references.
- VRM metadata indicates `avatarPermission=onlyAuthor` and `allowRedistribution=false`. Distribution, commercial use and streaming rights require separate review.
- Automated intake passes **only** for technical rig review. It does not verify anatomy, visual identity, texture fidelity, real-time performance or permissions to publish.

## Codespaces caveat

GitHub source control is connected, but the inspected browser session redirected `https://github.com/codespaces` to login. No Codespace command was executed or terminal status confirmed. Use the above commands inside your own authenticated `fictional-guacamole` Codespace once available; do not pretend that local tests ran remotely.

## Safe promotion

The existing `public/ALICE_CHARACTER_MANIFEST.json` owns the canonical approval gate. This studio validator returns `unapproved_candidate` on technical success. Existing procedural fallback and operational Alice are unchanged. CI tests exercise missing humanoid mappings, missing visemes, malformed GLBs and restricted redistribution metadata.
