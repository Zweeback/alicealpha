# Alice Studio (Beta)

The Alice Studio page at `/?studio=alice` is a new branded VRM/GLB interface for Alice Alpha.
It reuses the project's existing `AvatarWorkbench`, VRM/glTF loader and local assets rather than providing a disconnected mock-up.

## Implemented

- WebGL stage with the actual Alice model, orbit/zoom and local procedural fallback from the workbench.
- Switch between two shipped VRM candidates and the source GLB.
- Upload a `.vrm` / `.glb` model through the existing validated loader.
- Show mesh, bone, triangle and morph-target statistics derived from the loaded model, not mock values.
- Toggle individual mesh visibility, reset pose and export the edited scene as `.glb`.
- Responsive navigation and shortcuts to the existing viewer, components app and chat.

## Not yet connected

- Editing animation clips or recording motion to the timeline.
- Live speech-to-viseme mapping, face tracking or real-time model conversations inside the Studio.
- VRM re-export, rig validation, physics QA or deployment workflows.

The UI explicitly labels these features as unavailable. No successful build, FPS value or audit result is claimed without corresponding evidence.

## Verification

Run `npm run test:run` and `npm run build` from the repository root with dependencies installed. The model audit tests live in `src/studio/modelMetrics.test.js` and should be discovered by Vitest.

The interface is published to production only after review and merge of its development branch and successful deployment. Do not describe a branch/PR as a live rollout.
