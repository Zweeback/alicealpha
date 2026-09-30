#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as THREE from 'three';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, meshopt, prune, sparse, weld } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';

globalThis.window = globalThis.window || globalThis;
globalThis.window.URL = globalThis.window.URL || {};
globalThis.window.URL.createObjectURL = globalThis.window.URL.createObjectURL || (() => 'blob:alice-fbx-conversion');
globalThis.document = globalThis.document || {
  createElementNS() {
    return {
      addEventListener() {},
      removeEventListener() {},
      set src(value) { this.currentSrc = value; },
    };
  },
};
globalThis.FileReader = globalThis.FileReader || class FileReader extends EventTarget {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((buffer) => {
      this.result = buffer;
      this.dispatchEvent(new Event('loadend'));
      this.onloadend?.({ target: this });
    });
  }
  readAsDataURL(blob) {
    blob.arrayBuffer().then((buffer) => {
      this.result = `data:application/octet-stream;base64,${Buffer.from(buffer).toString('base64')}`;
      this.dispatchEvent(new Event('loadend'));
      this.onloadend?.({ target: this });
    });
  }
};

const here = dirname(fileURLToPath(import.meta.url));
const sourcePath = resolve(process.argv[2] || resolve(here, '../public/avatars/candidates/model.fbx'));
const outputPath = resolve(process.argv[3] || resolve(here, '../public/avatars/alice-rigged.glb'));
const diagnosticsPath = outputPath.replace(/\.glb$/i, '.json');

const sourceBytes = readFileSync(sourcePath);
const sourceBuffer = sourceBytes.buffer.slice(sourceBytes.byteOffset, sourceBytes.byteOffset + sourceBytes.byteLength);
const root = new FBXLoader().parse(sourceBuffer, `${dirname(sourcePath)}/`);

// Embedded FBX images require a browser image decoder. The first runtime slice
// deliberately exports neutral material colours while retaining geometry,
// skinning and facial controls. Texture restoration remains a separate visual
// acceptance step and cannot silently promote this candidate.
root.traverse((object) => {
  if (!object.isMesh) return;
  object.frustumCulled = false;
  const neutralize = (source) => new THREE.MeshStandardMaterial({
    name: source?.name || 'AliceCandidateMaterial',
    color: source?.color?.clone?.() || new THREE.Color('#b8aca6'),
    roughness: 0.72,
    metalness: 0.02,
    transparent: Boolean(source?.transparent),
    opacity: Number.isFinite(source?.opacity) ? source.opacity : 1,
    side: source?.side ?? THREE.FrontSide,
  });
  object.material = Array.isArray(object.material)
    ? object.material.map(neutralize)
    : neutralize(object.material);
});

const glb = await new GLTFExporter().parseAsync(root, {
  binary: true,
  trs: true,
  onlyVisible: true,
  animations: root.animations || [],
});
await MeshoptEncoder.ready;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
const document = await io.readBinary(new Uint8Array(glb));
await document.transform(dedup(), weld(), prune(), sparse(), meshopt({ encoder: MeshoptEncoder, level: 'high' }));
const outputBytes = Buffer.from(await io.writeBinary(document));
mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, outputBytes);

const bones = [];
const morphTargets = new Set();
let meshes = 0;
let skinnedMeshes = 0;
root.traverse((object) => {
  if (object.isBone) bones.push(object.name);
  if (!object.isMesh) return;
  meshes += 1;
  if (object.isSkinnedMesh) skinnedMeshes += 1;
  for (const name of Object.keys(object.morphTargetDictionary || {})) morphTargets.add(name);
});
const bounds = new THREE.Box3().setFromObject(root);
const diagnostics = {
  schemaVersion: '1.0.0',
  status: 'candidate',
  approved: false,
  source: {
    path: '/avatars/candidates/model.fbx',
    bytes: sourceBytes.length,
    sha256: createHash('sha256').update(sourceBytes).digest('hex'),
  },
  output: {
    path: '/avatars/alice-rigged.glb',
    bytes: outputBytes.length,
    sha256: createHash('sha256').update(outputBytes).digest('hex'),
  },
  scene: {
    meshes,
    skinnedMeshes,
    bones: [...new Set(bones)],
    morphTargets: [...morphTargets],
    animations: (root.animations || []).map((clip) => ({ name: clip.name, duration: clip.duration })),
    bounds: {
      min: bounds.min.toArray(),
      max: bounds.max.toArray(),
      size: bounds.getSize(new THREE.Vector3()).toArray(),
    },
  },
  limitations: [
    'neutral-material-export-without-embedded-textures',
    'identity-not-visually-approved',
    'candidate-must-remain-explicitly-selected',
  ],
};
writeFileSync(diagnosticsPath, `${JSON.stringify(diagnostics, null, 2)}\n`);
console.log(JSON.stringify(diagnostics, null, 2));
