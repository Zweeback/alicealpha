import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { evaluateAvatarPromotion } from '../src/xr/avatarQuality.js';
import { inspectGlbBuffer, inspectGlbFile } from '../tools/inspect_glb.mjs';

const manifest = JSON.parse(readFileSync('public/ALICE_CHARACTER_MANIFEST.json', 'utf8'));
const candidate = JSON.parse(readFileSync('public/avatars/alice-trellis.json', 'utf8'));
const report = JSON.parse(readFileSync('public/avatars/alice-trellis.inspection.json', 'utf8'));

describe('avatar identity, rig and promotion gate', () => {
  it('reports the current GLB as blocked and matches the checked-in inspection', () => {
    const actual = inspectGlbFile('public/avatars/alice-trellis.glb');

    expect(actual).toEqual(report);
    expect(actual.asset.sha256).toBe(candidate.asset.sha256);
    expect(actual.facialRig.jawAvailable).toBe(false);
    expect(actual.facialRig.status).toBe('blocked');
    expect(actual.facialRig.audioEnergyLipSync).toBe('blocked');
    expect(actual.promotion.status).toBe('blocked');
    expect(actual.promotion.blockers).toContain('Identity has not been visually verified by a human reviewer.');
    expect(actual.promotion.blockers).toContain('Run and record runtime diagnostics proving measured audio energy drives the real jaw control.');
  });

  it('inspects morph names, skeleton bones and rejects malformed GLB input', () => {
    const document = {
      asset: { version: '2.0' },
      nodes: [{ name: 'jaw' }, { name: 'hips' }],
      meshes: [{ name: 'face', extras: { targetNames: ['jawOpen'] }, primitives: [{ targets: [{}] }] }],
      skins: [{ joints: [0, 1] }],
    };
    const json = Buffer.from(JSON.stringify(document));
    const header = Buffer.alloc(20);
    header.write('glTF', 0);
    header.writeUInt32LE(2, 4);
    header.writeUInt32LE(20 + json.length, 8);
    header.writeUInt32LE(json.length, 12);
    header.writeUInt32LE(0x4e4f534a, 16);
    const inspection = inspectGlbBuffer(Buffer.concat([header, json]), {
      requiredHumanoidBones: ['hips'],
      requiredFacialExpressions: ['jawOpen'],
    });

    expect(inspection.meshes[0].name).toBe('face');
    expect(inspection.morphTargetNames).toEqual(['jawOpen']);
    expect(inspection.bones).toEqual(['jaw', 'hips']);
    expect(inspection.facialRig.jawAvailable).toBe(true);
    expect(inspection.facialRig.recommendedPath.at(-1)).toContain('do not upload reference videos');
    expect(() => inspectGlbBuffer(Buffer.from('not a GLB'))).toThrow('Invalid GLB header.');
  });

  it('blocks unverified identity, missing jaw/audio proof, and mismatched assets', () => {
    const result = evaluateAvatarPromotion(manifest, candidate, report);

    expect(result.canPromote).toBe(false);
    expect(result.failures).toContain('identity-not-verified');
    expect(result.failures).toContain('facial-rig-unavailable');
    expect(result.failures).toContain('audio-energy-lip-sync-not-validated');
    expect(evaluateAvatarPromotion(manifest, candidate, {
      ...report,
      asset: { ...report.asset, path: '/wrong.glb' },
    }).failures).toContain('rig-inspection-asset-mismatch');
  });

  it('requires all human, rig, audio and canonical approval evidence even when one case passes', () => {
    const eligibleCandidate = {
      ...candidate,
      quality: { identity: 'verified', humanTopology: true, rigged: true, approved: true },
      identityReview: {
        visualPassComment: 'Human visual review passed.',
        reviewer: 'human reviewer',
        reviewedAt: '2026-10-10T00:00:00Z',
      },
    };
    const eligibleInspection = {
      ...report,
      facialRig: {
        ...report.facialRig,
        status: 'available',
        jawAvailable: true,
        missingHumanoidBones: [],
        missingFacialExpressions: [],
        missingVisemes: [],
      },
      runtimeDiagnostics: { audioEnergyLipSync: 'passed' },
    };
    const approvedManifest = {
      ...manifest,
      identityRevision: 'alice-v0.4',
      sourceReferenceSetRevision: 'alice-reference-v1',
      canonicalAssetStatus: 'approved',
      approvedAsset: { ...candidate.asset },
      approval: {
        status: 'approved',
        approvedAt: '2026-10-10T00:00:00Z',
        approvedBy: 'human reviewer',
        approvedChecksum: candidate.asset.sha256,
      },
    };
    const pass = evaluateAvatarPromotion(approvedManifest, eligibleCandidate, eligibleInspection);
    const noIdentityReview = evaluateAvatarPromotion(approvedManifest, {
      ...eligibleCandidate,
      identityReview: undefined,
    }, eligibleInspection);

    expect(pass.canPromote).toBe(true);
    expect(pass.failures).toEqual([]);
    expect(noIdentityReview.canPromote).toBe(false);
    expect(noIdentityReview.failures).toContain('missing-visual-identity-review');
    expect(evaluateAvatarPromotion(approvedManifest, eligibleCandidate, {
      ...eligibleInspection,
      facialRig: { ...eligibleInspection.facialRig, missingVisemes: ['O'] },
    }).failures).toContain('missing-visemes');
  });
});
