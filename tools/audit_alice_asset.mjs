#!/usr/bin/env node
/** Static offline GLB/VRM audit. Never promotes an asset automatically. */
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const GLB_MAGIC = 0x46546c67;
const JSON_CHUNK = 0x4e4f534a;
const asArr = (x) => Array.isArray(x) ? x : [];
const unique = (xs) => [...new Set(xs)];

export function parseGlb(input) {
  const buf = Buffer.from(input);
  if (buf.length < 20) throw new Error('GLB is smaller than header + JSON chunk');
  if (buf.readUInt32LE(0) !== GLB_MAGIC) throw new Error('Not a GLB: invalid glTF magic');
  if (buf.readUInt32LE(4) !== 2) throw new Error('Only glTF 2.0 GLB is supported');
  if (buf.readUInt32LE(8) !== buf.length) throw new Error('GLB declared length disagrees with bytes');
  let off = 12, document = null, first = true;
  while (off < buf.length) {
    if (off + 8 > buf.length) throw new Error('Incomplete GLB chunk header');
    const size = buf.readUInt32LE(off), type = buf.readUInt32LE(off + 4);
    off += 8;
    if (size % 4 !== 0 || off + size > buf.length) throw new Error('GLB chunk length/alignment invalid');
    if (first && type !== JSON_CHUNK) throw new Error('First GLB chunk must be JSON');
    if (type === JSON_CHUNK) {
      if (document !== null) throw new Error('Duplicate GLB JSON chunk');
      try { document = JSON.parse(buf.subarray(off, off + size).toString('utf8').trim()); }
      catch { throw new Error('GLB JSON chunk cannot be parsed'); }
    }
    off += size; first = false;
  }
  if (!document) throw new Error('GLB is missing a JSON chunk');
  if (document.asset?.version !== '2.0') throw new Error('GLB asset.version must be 2.0');
  return document;
}

export function analyzeGlb(document, { name = 'alice.glb', byteLength = 0 } = {}) {
  const meshes = asArr(document.meshes), nodes = asArr(document.nodes);
  const skins = asArr(document.skins), accessors = asArr(document.accessors);
  const primitives = meshes.flatMap(m => asArr(m.primitives));
  const skinnedMeshNodes = nodes.filter(n => Number.isInteger(n.skin) && Number.isInteger(n.mesh)).length;
  const morphTargetCount = primitives.reduce((n,p) => n + asArr(p.targets).length, 0);
  let vertexCount = 0, triangleCount = 0;
  for (const p of primitives) {
    const vertex = accessors[p.attributes?.POSITION]?.count || 0;
    const index = accessors[p.indices]?.count;
    const n = Number.isInteger(index) ? index : vertex;
    vertexCount += vertex;
    const mode = p.mode ?? 4;
    if (mode === 4) triangleCount += Math.floor(n/3);
    if (mode === 5 || mode === 6) triangleCount += Math.max(0, n-2);
  }
  const vrm1 = document.extensions?.VRMC_vrm, vrm0 = document.extensions?.VRM;
  const morphNames = unique(meshes.flatMap(m => asArr(m.extras?.targetNames)));
  const expressionNames = unique([
    ...Object.keys(vrm1?.expressions?.preset || {}),
    ...asArr(vrm0?.blendShapeMaster?.blendShapeGroups).map(x => x.presetName).filter(Boolean),
    ...morphNames,
  ]);
  const norm = expressionNames.map(x => String(x).toLowerCase().replace(/[^a-z0-9]/g, ''));
  const hasExpr = (...aliases) => aliases.some(x => norm.includes(x.toLowerCase()));
  const blinkReady = hasExpr('blink','blinkLeft','blinkRight','eyeBlinkLeft','eyeBlinkRight');
  const mouthReady = hasExpr('aa','jawOpen','mouthOpen','visemeA','a');
  const headReady = Boolean(
    vrm1?.humanoid?.humanBones?.head ||
    vrm0?.humanoid?.humanBones?.some(x => x.bone === 'head') ||
    nodes.some(x => /^head$/i.test(x.name || ''))
  );
  const warnings = [];
  if (!skins.length || !skinnedMeshNodes) warnings.push('Missing skin binding: static scene, not deforming humanoid');
  if (!headReady) warnings.push('Head bone not verified');
  if (!morphTargetCount) warnings.push('No mesh morph targets: facial deformation unavailable');
  if (!blinkReady) warnings.push('Blink expression not mapped');
  if (!mouthReady) warnings.push('Mouth-open/AA expression not mapped');
  if (!asArr(document.animations).length) warnings.push('No embedded animation clips');
  if (!asArr(document.textures).length) warnings.push('No textures: surface realism needs review');
  if (triangleCount > 150000) warnings.push('Mobile triangle budget exceeded: check LODs');
  if (meshes.length === 1 && triangleCount > 150000 && !skins.length) warnings.push('Dense unrigged mesh: check for collage/scene reconstruction');
  return {
    file:name, byteLength, gltfVersion: document.asset.version,
    meshCount:meshes.length, primitiveCount:primitives.length,
    vertexCount, triangleCount, skinCount:skins.length,
    skinnedMeshNodes, nodeCount:nodes.length,
    animationCount:asArr(document.animations).length,
    morphTargetCount, morphNames, expressionNames,
    vrmVersion:vrm1 ? '1.0' : vrm0 ? '0.x' : null,
    materialCount:asArr(document.materials).length,
    textureCount:asArr(document.textures).length,
    imageCount:asArr(document.images).length,
    usedExtensions:asArr(document.extensionsUsed),
    readyForAnimationReview:Boolean(skins.length && skinnedMeshNodes && headReady && morphTargetCount && blinkReady && mouthReady),
    status:'unapproved_candidate', warnings,
    manualGates:[
      'compare identity to approved Alice frontal and profile reference',
      'verify single coherent anatomy and clean skin weights',
      'inspect topology, UV seams, physical textures and hair',
      'capture facial deformation and mobile WebGL frame-time',
      'obtain explicit owner approval in ALICE_CHARACTER_MANIFEST.json',
    ],
  };
}

export const inspectGlbBytes = (bytes, name='alice.glb') =>
  analyzeGlb(parseGlb(bytes), { name, byteLength:bytes.length });

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [filename,...rest] = process.argv.slice(2);
  if (!filename) {
    console.error('Usage: node tools/audit_alice_asset.mjs candidate.glb [--output report.json]');
    process.exitCode = 2;
  } else {
    try {
      const bytes = readFileSync(filename);
      const report = inspectGlbBytes(bytes, basename(filename));
      report.sha256 = createHash('sha256').update(bytes).digest('hex');
      const json = JSON.stringify(report,null,2) + '\n';
      const out = rest.indexOf('--output');
      if (out !== -1) {
        if (!rest[out+1]) throw new Error('--output requires a filename');
        writeFileSync(rest[out+1], json);
      }
      console.log(json);
    } catch (e) {
      console.error(JSON.stringify({file:filename,status:'invalid',reason:e.message}));
      process.exitCode = 1;
    }
  }
}
