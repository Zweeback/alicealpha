#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_MANIFEST = resolve(dirname(fileURLToPath(import.meta.url)), '../public/ALICE_CHARACTER_MANIFEST.json');

function parseGlb(buffer) {
  if (buffer.length < 20 || buffer.toString('ascii', 0, 4) !== 'glTF') {
    throw new Error('Invalid GLB header.');
  }
  if (buffer.readUInt32LE(4) !== 2 || buffer.readUInt32LE(8) !== buffer.length) {
    throw new Error('Unsupported GLB version or inconsistent file length.');
  }

  let offset = 12;
  let document = null;
  while (offset + 8 <= buffer.length) {
    const chunkLength = buffer.readUInt32LE(offset);
    const chunkType = buffer.readUInt32LE(offset + 4);
    offset += 8;
    if (offset + chunkLength > buffer.length) throw new Error('GLB chunk exceeds file length.');
    if (chunkType === 0x4e4f534a) {
      if (document) throw new Error('GLB contains multiple JSON chunks.');
      document = JSON.parse(buffer.toString('utf8', offset, offset + chunkLength).trim());
    }
    offset += chunkLength;
  }
  if (offset !== buffer.length || !document) throw new Error('GLB is missing a valid JSON chunk.');
  return document;
}

const normalize = (value) => String(value).toLowerCase().replace(/[^a-z0-9]/g, '');
const normalizePath = (value) => value.split(sep).join('/');
const hasText = (value) => typeof value === 'string' && value.trim().length > 0;

export function inspectGlbBuffer(buffer, {
  assetPath = 'candidate.glb',
  requiredHumanoidBones = [],
  requiredFacialExpressions = [],
  requiredVisemes = [],
  candidate = {},
  canonicalAssetStatus = 'pending',
  approvedAsset = null,
  approval = {},
  identityRevision = '',
  sourceReferenceSetRevision = '',
  promotionGate = {},
  fallbackPolicy = {},
} = {}) {
  const gltf = parseGlb(buffer);
  const nodes = (gltf.nodes || []).map((node, index) => ({ index, name: node.name || `node_${index}` }));
  const meshes = (gltf.meshes || []).map((mesh, meshIndex) => {
    const primitiveTargetNames = (mesh.primitives || []).flatMap((primitive) => (
      primitive.targets || []
    ).map((_, targetIndex) => mesh.extras?.targetNames?.[targetIndex] || `target_${targetIndex}`));
    return {
      index: meshIndex,
      name: mesh.name || `mesh_${meshIndex}`,
      morphTargets: [...new Set(primitiveTargetNames)],
    };
  });
  const morphTargetNames = [...new Set(meshes.flatMap((mesh) => mesh.morphTargets))].sort();
  const boneIndices = [...new Set((gltf.skins || []).flatMap((skin) => skin.joints || []))];
  const boneNames = boneIndices.map((index) => nodes[index]?.name || `node_${index}`);
  const normalizedMorphs = morphTargetNames.map(normalize);
  const normalizedBones = boneNames.map(normalize);
  const hasName = (names, requested) => names.some((name) => name === normalize(requested));
  const jawMorphNames = morphTargetNames.filter((name) => /(?:jaw.?open|mouth.?open|viseme.?a|^aa$)/i.test(name));
  const jawBoneNames = boneNames.filter((name) => /^(?:jaw|mandible)$/i.test(name));
  const foundFacialExpressions = requiredFacialExpressions.filter((name) => hasName(normalizedMorphs, name));
  const foundVisemes = requiredVisemes.filter((name) => hasName(normalizedMorphs, name)
    || normalizedMorphs.some((morph) => morph.includes(`viseme${normalize(name)}`)));
  const missingHumanoidBones = requiredHumanoidBones.filter((name) => !hasName(normalizedBones, name));
  const missingFacialExpressions = requiredFacialExpressions.filter((name) => !foundFacialExpressions.includes(name));
  const missingVisemes = requiredVisemes.filter((name) => !foundVisemes.includes(name));
  const sha256 = createHash('sha256').update(buffer).digest('hex');
  const normalizedAssetPath = normalizePath(assetPath);
  const jawAvailable = jawMorphNames.length > 0 || jawBoneNames.length > 0;
  const blockers = [];

  if (!jawAvailable) blockers.push('No jawOpen/mouthOpen/viseme-A morph target or jaw bone is present.');
  if (missingHumanoidBones.length) blockers.push(`Missing required humanoid bones: ${missingHumanoidBones.join(', ')}.`);
  if (missingFacialExpressions.length) blockers.push(`Missing required facial expression morph targets: ${missingFacialExpressions.join(', ')}.`);
  if (missingVisemes.length) blockers.push(`Missing required viseme morph targets: ${missingVisemes.join(', ')}.`);
  const promotionBlockers = [
    ...(candidate.quality?.identity === 'verified' ? [] : ['Identity has not been visually verified by a human reviewer.']),
    ...(hasText(candidate.identityReview?.visualPassComment)
      && hasText(candidate.identityReview?.reviewer)
      && hasText(candidate.identityReview?.reviewedAt)
      ? []
      : ['Record a human visual-pass comment, reviewer, and review timestamp after private reference comparison.']),
    ...(candidate.quality?.humanTopology === true ? [] : ['Candidate topology is not verified as human.']),
    ...(candidate.quality?.rigged === true ? [] : ['Candidate metadata does not confirm a facial rig.']),
    ...(candidate.quality?.approved === true ? [] : ['Candidate approval is not recorded.']),
    ...(candidate.asset?.path === normalizedAssetPath ? [] : ['Candidate metadata path does not match the inspected asset.']),
    ...(candidate.asset?.sha256 === sha256 ? [] : ['Candidate metadata checksum does not match the inspected asset.']),
    ...blockers,
    ...(candidate.runtimeDiagnostics?.audioEnergyLipSync === 'passed'
      ? []
      : ['Run and record runtime diagnostics proving measured audio energy drives the real jaw control.']),
    ...(canonicalAssetStatus === 'approved' ? [] : ['Canonical manifest approval is pending; keep this asset a candidate.']),
    ...(approvedAsset?.path === normalizedAssetPath ? [] : ['Approved manifest asset path does not match the inspected candidate.']),
    ...(approvedAsset?.sha256 === sha256 && approval.approvedChecksum === sha256
      ? []
      : ['Approved manifest checksum does not match the inspected candidate.']),
    ...(approval.status === 'approved' && hasText(approval.approvedBy) && hasText(approval.approvedAt)
      ? []
      : ['Manifest lacks explicit reviewer, timestamp, or approved status.']),
    ...(hasText(identityRevision) && !/pending/i.test(identityRevision)
      && hasText(sourceReferenceSetRevision) && !/pending/i.test(sourceReferenceSetRevision)
      ? []
      : ['Identity and source-reference revisions must be explicitly versioned, not pending.']),
    ...(promotionGate.requiresVisualPassComment === true
      && promotionGate.requiresRuntimeDiagnostics === true
      && promotionGate.requiresManifestValidation === true
      && promotionGate.requiresExplicitVersionBump === true
      && promotionGate.requiresIdentityReview === true
      && promotionGate.requiresRigInspection === true
      && fallbackPolicy.proceduralFallbackRequired === true
      && fallbackPolicy.defaultMayUseCandidateWithoutApproval === false
      ? []
      : ['Manifest promotion or fail-closed fallback policy is incomplete.']),
  ];

  return {
    schemaVersion: '1.0.0',
    asset: { path: normalizedAssetPath, bytes: buffer.length, sha256 },
    nodes: nodes.map((node) => node.name),
    meshes,
    morphTargetNames,
    bones: boneNames,
    facialRig: {
      status: jawAvailable && !missingHumanoidBones.length && !missingFacialExpressions.length && !missingVisemes.length
        ? 'available'
        : 'blocked',
      jawAvailable,
      jawMorphNames,
      jawBoneNames,
      foundHumanoidBones: requiredHumanoidBones.filter((name) => hasName(normalizedBones, name)),
      missingHumanoidBones,
      foundFacialExpressions,
      missingFacialExpressions,
      foundVisemes,
      missingVisemes,
      audioEnergyLipSync: jawAvailable ? 'requires-runtime-wiring-and-measurement' : 'blocked',
      blockers,
      recommendedPath: [
        'Keep this GLB as an unapproved visual source; do not replace the canonical asset.',
        'In a local rigging workflow, add the required humanoid skeleton and facial shape keys for jawOpen plus visemes A/I/U/E/O (or a measured jaw bone).',
        'Export a new GLB, rerun this inspection, and retain the source hash and provenance with the candidate.',
        'Only after a real jaw control exists, drive that control from measured speech energy and record runtime diagnostics; body/chest motion is not lip sync.',
        'Compare the candidate privately against the reference set and record explicit human identity approval; do not upload reference videos.',
      ],
    },
    runtimeDiagnostics: candidate.runtimeDiagnostics || { audioEnergyLipSync: 'not-run' },
    promotion: {
      status: promotionBlockers.length ? 'blocked' : 'eligible-for-explicit-promotion',
      blockers: promotionBlockers,
    },
  };
}

export function inspectGlbFile(assetPath, manifestPath = DEFAULT_MANIFEST, candidatePath = null) {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const buffer = readFileSync(assetPath);
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const relativeAssetPath = normalizePath(relative(repoRoot, resolve(assetPath)));
  const metadataPath = candidatePath || resolve(dirname(assetPath), `${assetPath.split(/[\\/]/).at(-1).replace(/\.glb$/i, '')}.json`);
  let candidate = {};
  try {
    candidate = JSON.parse(readFileSync(metadataPath, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  return inspectGlbBuffer(buffer, {
    assetPath: relativeAssetPath.startsWith('public/')
      ? `/${relativeAssetPath.slice('public/'.length)}`
      : relativeAssetPath,
    requiredHumanoidBones: manifest.requiredHumanoidBones || [],
    requiredFacialExpressions: manifest.requiredFacialExpressions || [],
    requiredVisemes: manifest.requiredVisemes || [],
    candidate,
    canonicalAssetStatus: manifest.canonicalAssetStatus,
    approvedAsset: manifest.approvedAsset,
    approval: manifest.approval,
    identityRevision: manifest.identityRevision,
    sourceReferenceSetRevision: manifest.sourceReferenceSetRevision,
    promotionGate: manifest.promotionGate,
    fallbackPolicy: manifest.fallbackPolicy,
  });
}

function runCli(args) {
  const assetPath = args[0];
  if (!assetPath) throw new Error('Usage: node tools/inspect_glb.mjs <asset.glb> [report.json]');
  const report = inspectGlbFile(resolve(assetPath));
  const outputPath = args[1];
  const json = `${JSON.stringify(report, null, 2)}\n`;
  if (outputPath) writeFileSync(resolve(outputPath), json);
  process.stdout.write(json);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    runCli(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
