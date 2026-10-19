# ALICE — Codespaces Blender / VRM setup

This branch adds Blender to the existing Debian/Node 22 devcontainer. Rebuild the Codespace after merging or selecting the branch to install Blender. The post-create script clones the official [VRM add-on source](https://github.com/saturday06/VRM-Addon-for-Blender) into ignored local `.alice-tools/`; **this does not enable the add-on**.

## Verify

```bash
blender --version
bash tools/setup_vrm_resources.sh
npm run build
npm run test:run
```

## Finish the VRM toolchain

1. Check Blender's exact version.
2. Download a compatible release ZIP from [VRM-Addon-for-Blender releases](https://github.com/saturday06/VRM-Addon-for-Blender/releases) and verify provenance/version.
3. Install and enable it in Blender preferences. Verify the VRM import/export operators before claiming an operational VRM pipeline.
4. Import ALICE's existing FBX/GLB candidate assets; sculpt/retopologize, UV/texture, rig humanoid bones, set blink/visemes/expression morph targets and export VRM 1.0.
5. Validate in @pixiv/three-vrm and the current AliceWorld runtime. Keep the original .blend file and asset hashes.

## Scope

No codespace was remotely created or modified by the GitHub connector. A Codespace rebuild is required. Existing assets are preserved; this is toolchain preparation rather than a claim that a finished avatar exists.
