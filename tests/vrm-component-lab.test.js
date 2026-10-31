import { describe, expect, it } from 'vitest';
import { collectWorkbenchSnapshot } from '../src/viewer/vrmComponentStats.js';

describe('collectWorkbenchSnapshot', () => {
  it('collects mesh visibility, bones and morph targets', () => {
    const meshes = [
      { isMesh: true, name: 'Face', visible: true, uuid: 'mesh-1', morphTargetDictionary: { blink: 0, smile: 1 } },
      { isMesh: true, name: '', visible: false, uuid: 'mesh-2', morphTargetDictionary: { smile: 0, jawOpen: 1 } },
      { isMesh: false },
    ];
    const workbench = {
      model: { traverse: (visit) => meshes.forEach(visit) },
      bones: [{ name: 'Hips' }, { name: 'Head' }],
      type: 'vrm',
      countMeshes: () => 2,
    };

    const snapshot = collectWorkbenchSnapshot(workbench);
    expect(snapshot.parts).toEqual([
      { name: 'Face', visible: true, uuid: 'mesh-1' },
      { name: 'Mesh', visible: false, uuid: 'mesh-2' },
    ]);
    expect(snapshot.stats).toEqual({
      type: 'vrm',
      boneCount: 2,
      meshCount: 2,
      bones: ['Hips', 'Head'],
      morphs: ['blink', 'jawOpen', 'smile'],
    });
  });

  it('handles a model without optional rig or morph metadata', () => {
    const snapshot = collectWorkbenchSnapshot({
      model: { traverse: (visit) => visit({ isMesh: true, uuid: 'plain', visible: true }) },
      type: 'glb',
    });
    expect(snapshot.stats).toEqual({
      type: 'glb',
      boneCount: 0,
      meshCount: 1,
      bones: [],
      morphs: [],
    });
  });
});
