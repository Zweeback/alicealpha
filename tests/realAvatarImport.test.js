import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { inspectAvatarCandidate } from '../src/xr/AliceWorld.js';
import { AVATAR_CATALOG, resolveAvatarSelection } from '../src/xr/avatarCatalog.js';

globalThis.self = globalThis;

function loadGlfSync(filePath) {
  const buf = fs.readFileSync(filePath);
  const arrayBuffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const loader = new GLTFLoader();
  return new Promise((resolve, reject) => {
    loader.parse(arrayBuffer, '', resolve, reject);
  });
}

describe('Real-Avatar Import Blocker & Contract Tests', () => {
  it('registers both unrigged TRELLIS and owned rigged candidate in AVATAR_CATALOG', () => {
    expect(AVATAR_CATALOG.trellis.url).toBe('/avatars/alice-trellis.glb');
    expect(AVATAR_CATALOG.rigged.url).toBe('/avatars/alice-rigged.glb');
    expect(resolveAvatarSelection('?avatar=rigged').id).toBe('rigged');
  });

  it('isolates exact blocker evidence for unrigged candidate (alice-trellis.glb)', async () => {
    const gltf = await loadGlfSync('public/avatars/alice-trellis.glb');
    const diagnostics = inspectAvatarCandidate(gltf);

    expect(diagnostics.rigged).toBe(false);
    expect(diagnostics.boneCount).toBe(0);
    expect(diagnostics.blocker).not.toBeNull();
    expect(diagnostics.blocker.code).toBe('unrigged_asset_missing_bones');
    expect(diagnostics.blocker.message).toContain('contains no skeletal bones');
  });

  it('proves passing import contract for owned rigged candidate (alice-rigged.glb)', async () => {
    const gltf = await loadGlfSync('public/avatars/alice-rigged.glb');
    const diagnostics = inspectAvatarCandidate(gltf);

    expect(diagnostics.rigged).toBe(true);
    expect(diagnostics.boneCount).toBeGreaterThan(5);
    expect(diagnostics.bonesFound).toContain('head');
    expect(diagnostics.bonesFound).toContain('leftUpperArm');
    expect(diagnostics.bonesFound).toContain('rightUpperArm');
    expect(diagnostics.morphTargets).toContain('jawOpen');
    expect(diagnostics.morphTargets).toContain('blink');
    expect(diagnostics.morphTargets).toContain('smile');
    expect(diagnostics.blocker).toBeNull();
  });

  it('verifies bone and morph target binding for rigged avatar runtime drive', async () => {
    const gltf = await loadGlfSync('public/avatars/alice-rigged.glb');
    const model = gltf.scene || gltf.scenes[0];

    let headBone = null;
    let leftArmBone = null;
    let rightArmBone = null;
    let meshWithMorphs = null;

    model.traverse((obj) => {
      if (obj.isBone && obj.name === 'head') headBone = obj;
      if (obj.isBone && obj.name === 'leftUpperArm') leftArmBone = obj;
      if (obj.isBone && obj.name === 'rightUpperArm') rightArmBone = obj;
      if (obj.isMesh && obj.morphTargetDictionary) meshWithMorphs = obj;
    });

    expect(headBone).not.toBeNull();
    expect(leftArmBone).not.toBeNull();
    expect(rightArmBone).not.toBeNull();
    expect(meshWithMorphs).not.toBeNull();

    // Verify morph target dictionary indices
    const dict = meshWithMorphs.morphTargetDictionary;
    expect(dict.jawOpen).toBeDefined();
    expect(dict.blink).toBeDefined();
    expect(dict.smile).toBeDefined();
  });
});
