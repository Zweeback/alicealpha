#!/usr/bin/env node
/** Alice CGI studio: offline VRM 1.0 intake audit. Never auto-promotes an avatar. */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const requiredBones = Object.freeze([
  'hips','spine','chest','neck','head','leftUpperArm','leftLowerArm','leftHand',
  'rightUpperArm','rightLowerArm','rightHand','leftUpperLeg','leftLowerLeg','leftFoot',
  'rightUpperLeg','rightLowerLeg','rightFoot',
]);
const requiredExpressions = Object.freeze(['blink','blinkLeft','blinkRight','aa','ih','ou','ee','oh']);

export function parseGlb(buffer) {
  const b = Buffer.from(buffer);
  if (b.length < 20 || b.readUInt32LE(0) !== 0x46546c67) throw new Error('Invalid GLB header');
  if (b.readUInt32LE(4) !== 2 || b.readUInt32LE(8) !== b.length) throw new Error('GLB version/length mismatch');
  let offset = 12, json = null;
  while (offset < b.length) {
    if (offset + 8 > b.length) throw new Error('Truncated GLB chunk');
    const length = b.readUInt32LE(offset), type = b.readUInt32LE(offset + 4);
    offset += 8;
    if (length % 4 || offset + length > b.length) throw new Error('Invalid GLB chunk length');
    if (json === null && type !== 0x4e4f534a) throw new Error('First GLB chunk must contain JSON');
    if (type === 0x4e4f534a) {
      if (json !== null) throw new Error('Duplicate JSON chunk');
      json = JSON.parse(b.subarray(offset, offset + length).toString('utf8').trim());
    }
    offset += length;
  }
  if (!json || json.asset?.version !== '2.0') throw new Error('Missing glTF 2.0 document');
  return json;
}

export function auditVrmBytes(buffer, filename = 'alice.vrm') {
  const doc = parseGlb(buffer);
  const vrm = doc.extensions?.VRMC_vrm;
  const fail = [], warn = [];
  const bones = vrm?.humanoid?.humanBones || {};
  const preset = vrm?.expressions?.preset || {};
  if (vrm && vrm.specVersion !== '1.0') fail.push('Unsupported VRM specification version');
  const meshes = doc.meshes || [], nodes = doc.nodes || [], skins = doc.skins || [];
  const accessors = doc.accessors || [];
  const required = (ok, reason) => { if (!ok) fail.push(reason); };
  required(Boolean(vrm), 'VRMC_vrm extension absent');
  required(skins.length > 0, 'Skinned skeleton absent');
  required(nodes.some(n => Number.isInteger(n.skin) && Number.isInteger(n.mesh)), 'No mesh node bound to skin');
  const missingBones = requiredBones.filter(name => !Number.isInteger(bones[name]?.node) || bones[name].node < 0 || bones[name].node >= nodes.length);
  required(!missingBones.length, 'Missing/invalid humanoid bones: ' + missingBones.join(', '));
  const missingExpressions = requiredExpressions.filter(name => !preset[name]);
  required(!missingExpressions.length, 'Missing VRM facial presets: ' + missingExpressions.join(', '));
  let triangles = 0, morphCount = 0, weightedPrimitiveCount = 0;
  for (const mesh of meshes) for (const p of mesh.primitives || []) {
    const count = accessors[p.indices]?.count ?? accessors[p.attributes?.POSITION]?.count ?? 0;
    if ((p.mode ?? 4) === 4) triangles += Math.floor(count / 3);
    else if ((p.mode ?? 4) === 5 || (p.mode ?? 4) === 6) triangles += Math.max(count - 2, 0);
    morphCount += (p.targets || []).length;
    if (p.attributes?.JOINTS_0 != null && p.attributes?.WEIGHTS_0 != null) weightedPrimitiveCount++;
  }
  required(weightedPrimitiveCount > 0, 'No vertex joint/weight channels');
  required(morphCount > 0, 'No face morph targets');
  if (triangles > 65000) warn.push('Exceeds initial 65k-triangle mobile CGI target');
  if (!(doc.animations || []).length) warn.push('No embedded animation clips; runtime animation required');
  if (!(doc.textures || []).length) warn.push('No textures; review visual fidelity manually');
  if (!doc.extensions?.VRMC_springBone) warn.push('No springBone metadata');
  const metadata = vrm?.meta || {};
  const privateUse = metadata.avatarPermission === 'onlyAuthor' || metadata.allowRedistribution === false;
  if (privateUse) warn.push('Restricted avatar permissions: do not publish the VRM binary in public repository');
  return {
    file: filename, sha256: createHash('sha256').update(buffer).digest('hex'),
    status: fail.length ? 'failed_candidate' : 'unapproved_candidate',
    validForRigReview: !fail.length, failures: fail, warnings: warn,
    metrics: { bytes: buffer.length, triangles, nodeCount: nodes.length, meshCount: meshes.length,
      skinCount: skins.length, weightedPrimitiveCount, morphTargetBindings: morphCount,
      uniqueMorphNames: [...new Set(meshes.flatMap(m => m.extras?.targetNames || []))],
      materials: (doc.materials || []).length, textures: (doc.textures || []).length,
      animations: (doc.animations || []).length,
      springBone: Boolean(doc.extensions?.VRMC_springBone),
      missingBones, missingExpressions,
    },
    distribution: privateUse ? 'private_only_unless_permission_changes' : 'review_metadata_and_rights',
    promotion: 'manual_gate_only',
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const path = process.argv[2];
  if (!path) {
    console.error('Usage: node tools/validate_alice_vrm.mjs /path/to/alice.vrm');
    process.exitCode = 2;
  } else {
    try {
      const result = auditVrmBytes(readFileSync(path), basename(path));
      console.log(JSON.stringify(result, null, 2));
      if (result.failures.length) process.exitCode = 1;
    } catch (error) {
      console.error(JSON.stringify({ status:'invalid_file',error: error.message }));
      process.exitCode = 1;
    }
  }
}
