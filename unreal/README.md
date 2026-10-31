# ALICE Unreal production runtime

This folder is the Unreal-side production target. It complements (does not replace) the existing browser/WebXR companion in `src/`.

## Engine

Pinned baseline: Unreal Engine 5.8. Epic released 5.8 on 23 June 2026. MetaHuman Creator is integrated in the editor from UE 5.6 onward. Install the engine through Epic Games Launcher with **MetaHuman Creator Core Data** selected.

Open `ALICE/ALICE.uproject` in Unreal Engine 5.8. The project enables the documented MetaHuman Creator, MetaHuman Animator, MetaHuman Live Link, Control Rig, Live Link, Niagara, Movie Render Pipeline and OpenXR plugins. If the editor reports a plugin unavailable, do not silently remove it: check the installed engine version and platform support first.

## Workstation gate

MetaHuman Creator/Animator recommended baseline: Windows, 16 high-performance physical CPU cores, 32 GB RAM, and an RTX 3070 / RX 6800 XT / Apple M2 Ultra class GPU with at least 8 GB VRAM. General UE5 development recommends 32 GB RAM and 8 GB graphics memory. Lumen/Nanite and hardware ray tracing need a supported DX12/SM6 GPU and current drivers.

Do not attempt to install or run the Unreal Editor on the Pixel 9a, Surface Go 2, or the existing small Debian Android VM. Use a capable Windows workstation or a GPU cloud workstation. Keep the browser/WebXR client as the lightweight mobile surface.

## Production architecture

- **Digital human:** MetaHuman Creator as the canonical high-fidelity human. Do not promote the existing procedural mesh or FBX-derived GLB to final.
- **Face/performance:** MetaHuman Live Link for real-time audio, mono camera, or supported phone capture; MetaHuman Animator for offline solving. Validate the Pixel 9a against Epic's current device matrix before relying on it.
- **Body:** Control Rig and Animation Blueprint; use motion capture / retargeted animation rather than hand-authored primitive ellipsoids.
- **Skin, eyes, hair, cloth:** MetaHuman physically based materials, strand grooms, layered skin shading, eye refraction/cornea and groom/cloth simulation. Tune under neutral daylight and cinematic key/fill/rim setups.
- **Lighting/render:** Lumen GI/reflections as the default scalable baseline. Enable hardware ray tracing only on a validated GPU; it has a material performance cost. Use Movie Render Queue for offline hero shots.
- **Worlds / photogrammetry:** use RealityScan/RealityCapture or Blender for reconstruction and cleanup; import calibrated meshes/materials. Use Nanite for suitable dense static environments, not as a substitute for a properly rigged digital human.
- **Gaussian splats:** evaluate YaGS as an optional environment-capture plugin, not as the avatar body. Its documented target is UE 5.5+ and its recommended GPU baseline is RTX 3070 / RX 6700 XT class with 8 GB+ VRAM. Pin a release/commit and validate its license and build against UE 5.8 before adding it.
- **VR/AR:** OpenXR for headset VR; retain the current WebXR/PWA surface for browser/mobile. Build a separate Android AR path only after device and rendering profiling. Do not promise desktop MetaHuman fidelity on a mobile GPU.
- **Pixel sprites / 2D effects:** use Niagara flipbooks, sprites and render-target compositing for stylized effects and UI accents. Keep these as a separate presentation layer; they do not replace physically based skin, hair or face geometry.
- **Voice / Companion:** the existing Node/Realtime and companion memory APIs remain authoritative. Unreal receives bounded semantic cues (emotion, gaze, gesture, viseme/audio energy) through a versioned local WebSocket adapter; Unreal never receives model credentials or writes confirmed memory.
- **Narrative Studio:** treat the existing NewsStudio scene-plan/render-queue as the first narrative client. Unreal Sequencer/Movie Render Queue becomes the cinematic render backend; story plans and evidence/source metadata remain in the web app.

## First character acceptance gate

Do not call the character ALICE-final until all of these pass: neutral front/side/three-quarter face review; close-up skin/eye/teeth/hair review; natural blink and gaze; speech visemes synchronized to German speech; at least six distinct emotions; head/neck/body motion without mesh collapse; 30 FPS interactive target on the selected workstation; and a verified mobile/VR fallback.

The existing `public/avatars/alice-fbx-source.glb` remains a reference/import candidate only. Its browser render proves that the asset loads, not that its appearance is acceptable.

## Install and verification

1. Install Epic Games Launcher and Unreal Engine 5.8 on the workstation; select MetaHuman Creator Core Data.
2. Open `ALICE/ALICE.uproject` and allow the editor to compile shaders and initialize plugins.
3. Create a MetaHuman character asset in the Content Browser and assemble it into `/Game/ALICE/Characters`.
4. Create `L_ALICE_Studio`, then add the MetaHuman, neutral studio lighting, CineCameraActor and Post Process Volume.
5. Connect the MetaHuman Live Link source and test audio/mono-camera capture before phone capture.
6. Export only a review proxy (GLB/VRM if supported by the selected export route) back through the existing candidate importer. The Unreal project remains the canonical high-fidelity source.

This scaffold is configuration only. It does not install the proprietary engine, download MetaHuman content, create a MetaHuman asset, or prove a workstation build. Those actions require the signed-in Epic Launcher and a compatible GPU workstation.
