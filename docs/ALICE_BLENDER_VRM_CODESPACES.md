# ALICE — Blender / VRM Codespace Studio

## Existing source of truth

This repository already contains a candidate FBX and converted GLB. The current source GLB is recorded as 73 armature bones and 8 weighted meshes, SHA-256:
`4580ac1c35a8bf4b49ac29d390197dd49cea053de42d563dbe940d09c0adeb30`.

Run the existing `tools/build_alice_designsheet.py` against that source rather than silently replacing it with an approximate primitive-based character.

## Codespace

On this feature branch, new Codespaces run `npm ci` and `bash .devcontainer/install-blender-vrm.sh` during post-create. The installer provisions apt Blender and official VRM Add-on v4.10.2, checks its repo/tag and prints `ALICE_VRM_READY` when enabled. Existing Codespaces must execute installation themselves.

```bash
bash .devcontainer/install-blender-vrm.sh
python3 tools/alice_codespace_telemetry.py --write-local
blender --background --python tools/build_alice_designsheet.py
```

`tools/alice_codespace_telemetry.py` returns only a sanitized read-only JSON snapshot. It does not capture secrets and does **not** push continuously to ChatGPT. Browser access must be authenticated to inspect a Codespace terminal live. The local `.alice/telemetry/latest.json` output must not be committed or published.

## Reference modes

- Base: adult anime ALICE with red/copper hair, blue eyes and selective teal streaks; preserve the real source humanoid rig and facial blendshapes.
- Parallax: lavender/white news-presenter jacket, hood with cat-ear tips, glowing pendant, asymmetrical sock and chunky sneakers.
- Witch: removable black pointed hat and black-violet skirt and cape with pink/cyan glowing accents.
- Cyber: removable white/silver exo-tech armor segments with violet/cyan emissive cores.
- INK: separate floating shape-shifting shadow-cat character and interface companion. Same ALICE AI core; no second independent AI model.

## Quality and safety gates

Preserve original FBX/GLB assets and source SHA. Every generated model is an unapproved candidate until mesh/UV/textures, 73-bone skin weights, expressions, runtime viewer compatibility, mobile performance, identity and provenance are audited. Do not change the manifest's approval state automatically.

Official resources: https://github.com/saturday06/VRM-Addon-for-Blender and https://github.com/pixiv/three-vrm.
