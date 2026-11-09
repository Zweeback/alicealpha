import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { validateAliceCharacterManifest } from '../src/xr/avatarQuality.js';

const manifest = JSON.parse(readFileSync('public/ALICE_CHARACTER_MANIFEST.json', 'utf8'));

describe('Alice character manifest gate', () => {
  it('accepts the checked-in pending manifest while keeping candidates non-canonical', () => {
    const result = validateAliceCharacterManifest(manifest);

    expect(result.pass).toBe(true);
    expect(result.canPromote).toBe(false);
    expect(result.failures).toEqual([]);
    expect(manifest.canonicalAssetStatus).toBe('pending');
    expect(manifest.fallbackPolicy.defaultMayUseCandidateWithoutApproval).toBe(false);
  });

  it('fails closed when fallback or approval gates are removed', () => {
    const result = validateAliceCharacterManifest({
      ...manifest,
      fallbackPolicy: {
        ...manifest.fallbackPolicy,
        proceduralFallbackRequired: false,
      },
      promotionGate: {
        ...manifest.promotionGate,
        requiresVisualPassComment: false,
      },
    });

    expect(result.pass).toBe(false);
    expect(result.failures).toContain('missing-procedural-fallback');
    expect(result.failures).toContain('missing-visual-pass-gate');
  });

  it('requires checksum, timestamp and asset path before approved promotion', () => {
    const result = validateAliceCharacterManifest({
      ...manifest,
      canonicalAssetStatus: 'approved',
    });

    expect(result.pass).toBe(false);
    expect(result.failures).toContain('approved-missing-asset-path');
    expect(result.failures).toContain('approved-missing-timestamp');
    expect(result.failures).toContain('approved-missing-checksum');
  });

  it('binds synthetic approval to a registered candidate and its SHA-256', () => {
    const candidate = {
      ...manifest.candidateAssets[0],
      assetAudit: {
        ...manifest.candidateAssets[0].assetAudit,
        identityVerified: true,
        faceRigRuntimeVerified: true,
      },
    };
    const approved = {
      ...manifest,
      canonicalAssetStatus: 'approved',
      approvedAsset: { path: candidate.path },
      candidateAssets: [candidate, ...manifest.candidateAssets.slice(1)],
      approval: {
        status: 'approved',
        approvedAt: '2026-11-09T08:00:00Z',
        approvedBy: 'synthetic-test-reviewer',
        approvedChecksum: candidate.sha256,
      },
    };

    // This is a shape-validation fixture, never a real asset identity approval.
    expect(validateAliceCharacterManifest(approved).canPromote).toBe(true);

    const wrongChecksum = {
      ...approved,
      approval: { ...approved.approval, approvedChecksum: '0'.repeat(64) },
    };
    expect(validateAliceCharacterManifest(wrongChecksum).failures).toContain('approved-checksum-mismatch');

    const unknownAsset = {
      ...approved,
      approvedAsset: { path: '/avatars/not-registered.glb' },
    };
    expect(validateAliceCharacterManifest(unknownAsset).failures).toContain('approved-asset-not-registered-candidate');

    const missingReviewer = {
      ...approved,
      approval: { ...approved.approval, approvedBy: null },
    };
    expect(validateAliceCharacterManifest(missingReviewer).failures).toContain('approved-missing-approver');

    const unverifiedRig = {
      ...approved,
      candidateAssets: [
        {
          ...candidate,
          assetAudit: { ...candidate.assetAudit, identityVerified: false, faceRigRuntimeVerified: false },
        },
        ...manifest.candidateAssets.slice(1),
      ],
    };
    expect(validateAliceCharacterManifest(unverifiedRig).failures).toEqual(
      expect.arrayContaining(['approved-identity-unverified', 'approved-face-runtime-unverified']),
    );
  });
});
