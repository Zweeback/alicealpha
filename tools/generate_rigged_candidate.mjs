import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import fs from 'node:fs';
import path from 'node:path';

// Node polyfills for GLTFExporter & GLTFLoader
globalThis.self = globalThis;
globalThis.FileReader = class FileReader extends EventTarget {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((buf) => {
      this.result = buf;
      this.dispatchEvent(new Event('load'));
      if (typeof this.onload === 'function') this.onload({ target: this });
      if (typeof this.onloadend === 'function') this.onloadend({ target: this });
    });
  }
  readAsDataURL(blob) {
    blob.arrayBuffer().then((buf) => {
      this.result = 'data:application/octet-stream;base64,' + Buffer.from(buf).toString('base64');
      this.dispatchEvent(new Event('load'));
      if (typeof this.onload === 'function') this.onload({ target: this });
      if (typeof this.onloadend === 'function') this.onloadend({ target: this });
    });
  }
};

export async function generateRiggedCandidate(outputPath = 'public/avatars/alice-rigged.glb') {
  const scene = new THREE.Scene();
  const geometry = new THREE.BoxGeometry(0.5, 1.5, 0.3, 4, 12, 4);

  const positionAttribute = geometry.attributes.position;
  const jawOpenPositions = [];
  const blinkPositions = [];
  const smilePositions = [];

  for (let i = 0; i < positionAttribute.count; i++) {
    const y = positionAttribute.getY(i);
    const x = positionAttribute.getX(i);
    const z = positionAttribute.getZ(i);

    if (y > 0.3 && y < 0.5 && z > 0.1) {
      jawOpenPositions.push(x, y - 0.15, z);
    } else {
      jawOpenPositions.push(x, y, z);
    }

    if (y > 0.5 && y < 0.65 && z > 0.1) {
      blinkPositions.push(x, y - 0.05, z);
    } else {
      blinkPositions.push(x, y, z);
    }

    if (y > 0.35 && y < 0.48 && Math.abs(x) > 0.1) {
      smilePositions.push(x * 1.2, y + 0.05, z);
    } else {
      smilePositions.push(x, y, z);
    }
  }

  const jawAttr = new THREE.Float32BufferAttribute(jawOpenPositions, 3); jawAttr.name = 'jawOpen';
  const blinkAttr = new THREE.Float32BufferAttribute(blinkPositions, 3); blinkAttr.name = 'blink';
  const smileAttr = new THREE.Float32BufferAttribute(smilePositions, 3); smileAttr.name = 'smile';

  geometry.morphAttributes.position = [jawAttr, blinkAttr, smileAttr];

  const hips = new THREE.Bone(); hips.name = 'hips'; hips.position.set(0, 0, 0);
  const spine = new THREE.Bone(); spine.name = 'spine'; spine.position.set(0, 0.4, 0); hips.add(spine);
  const chest = new THREE.Bone(); chest.name = 'chest'; chest.position.set(0, 0.3, 0); spine.add(chest);
  const neck = new THREE.Bone(); neck.name = 'neck'; neck.position.set(0, 0.3, 0); chest.add(neck);
  const head = new THREE.Bone(); head.name = 'head'; head.position.set(0, 0.2, 0); neck.add(head);

  const leftEye = new THREE.Bone(); leftEye.name = 'leftEye'; leftEye.position.set(-0.08, 0.1, 0.15); head.add(leftEye);
  const rightEye = new THREE.Bone(); rightEye.name = 'rightEye'; rightEye.position.set(0.08, 0.1, 0.15); head.add(rightEye);

  const leftUpperArm = new THREE.Bone(); leftUpperArm.name = 'leftUpperArm'; leftUpperArm.position.set(-0.3, 0.2, 0); chest.add(leftUpperArm);
  const leftLowerArm = new THREE.Bone(); leftLowerArm.name = 'leftLowerArm'; leftLowerArm.position.set(-0.25, 0, 0); leftUpperArm.add(leftLowerArm);

  const rightUpperArm = new THREE.Bone(); rightUpperArm.name = 'rightUpperArm'; rightUpperArm.position.set(0.3, 0.2, 0); chest.add(rightUpperArm);
  const rightLowerArm = new THREE.Bone(); rightLowerArm.name = 'rightLowerArm'; rightLowerArm.position.set(0.25, 0, 0); rightUpperArm.add(rightLowerArm);

  const skinIndices = [];
  const skinWeights = [];

  for (let i = 0; i < positionAttribute.count; i++) {
    const y = positionAttribute.getY(i);
    if (y > 0.4) {
      skinIndices.push(4, 3, 2, 0);
      skinWeights.push(0.7, 0.2, 0.1, 0);
    } else if (y > 0) {
      skinIndices.push(2, 1, 0, 0);
      skinWeights.push(0.5, 0.5, 0, 0);
    } else {
      skinIndices.push(0, 1, 0, 0);
      skinWeights.push(0.8, 0.2, 0, 0);
    }
  }

  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndices, 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeights, 4));

  const material = new THREE.MeshStandardMaterial({ color: 0xcccccc });
  const mesh = new THREE.SkinnedMesh(geometry, material);
  mesh.name = 'alice_mesh';

  const skeleton = new THREE.Skeleton([hips, spine, chest, neck, head, leftEye, rightEye, leftUpperArm, leftLowerArm, rightUpperArm, rightLowerArm]);
  mesh.bind(skeleton);

  scene.add(mesh);
  scene.add(hips);

  const exporter = new GLTFExporter();
  const arrayBuffer = await new Promise((resolve, reject) => {
    exporter.parse(
      scene,
      (gltf) => resolve(gltf),
      (err) => reject(err),
      { binary: true }
    );
  });

  const fullPath = path.resolve(outputPath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, Buffer.from(arrayBuffer));
  return { path: outputPath, size: arrayBuffer.byteLength };
}

if (process.argv[1] && process.argv[1].endsWith('generate_rigged_candidate.mjs')) {
  generateRiggedCandidate()
    .then((res) => console.log(`Generated rigged avatar candidate at ${res.path} (${res.size} bytes)`))
    .catch((err) => {
      console.error('Generation failed:', err);
      process.exit(1);
    });
}
