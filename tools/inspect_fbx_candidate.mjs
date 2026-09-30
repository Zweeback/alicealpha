#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';

// FBXLoader creates browser image handles for embedded textures even though this
// inspector only needs scene structure. Keep those handles inert in Node.
globalThis.window = globalThis.window || globalThis;
globalThis.window.URL = globalThis.window.URL || {};
globalThis.window.URL.createObjectURL = globalThis.window.URL.createObjectURL || (() => 'blob:alice-fbx-inspection');
globalThis.document = globalThis.document || {
  createElementNS() {
    return {
      addEventListener() {},
      removeEventListener() {},
      set src(value) { this.currentSrc = value; },
    };
  },
};

const here = dirname(fileURLToPath(import.meta.url));
const candidatePath = resolve(process.argv[2] || resolve(here, '../public/avatars/candidates/model.fbx'));
const bytes = readFileSync(candidatePath);
const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
const root = new FBXLoader().parse(arrayBuffer, `${dirname(candidatePath)}/`);

const diagnostics = {
  path: candidatePath,
  bytes: bytes.length,
  sha256: createHash('sha256').update(bytes).digest('hex'),
  objects: 0,
  meshes: 0,
  skinnedMeshes: 0,
  bones: [],
  morphTargets: [],
  materials: new Set(),
  animations: (root.animations || []).map((clip) => ({
    name: clip.name,
    duration: clip.duration,
    tracks: clip.tracks.length,
  })),
};

root.traverse((object) => {
  diagnostics.objects += 1;
  if (object.isBone) diagnostics.bones.push(object.name);
  if (object.isMesh) {
    diagnostics.meshes += 1;
    if (object.isSkinnedMesh) diagnostics.skinnedMeshes += 1;
    for (const name of Object.keys(object.morphTargetDictionary || {})) diagnostics.morphTargets.push(name);
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) if (material?.name) diagnostics.materials.add(material.name);
  }
});

const bounds = new THREE.Box3().setFromObject(root);
const size = bounds.getSize(new THREE.Vector3());
const center = bounds.getCenter(new THREE.Vector3());

console.log(JSON.stringify({
  ...diagnostics,
  bones: [...new Set(diagnostics.bones)],
  morphTargets: [...new Set(diagnostics.morphTargets)],
  materials: [...diagnostics.materials],
  bounds: {
    min: bounds.min.toArray(),
    max: bounds.max.toArray(),
    size: size.toArray(),
    center: center.toArray(),
  },
}, null, 2));
