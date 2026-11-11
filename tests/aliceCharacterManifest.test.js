import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { validateAliceCharacterManifest, verifyApprovedAssetIntegrity } from '../src/xr/avatarQuality.js';

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

  it('rejects unknown canonical status rather than treating it as pending', () => {
    for (const status of ['reviewed', 'APPROVED', 'disabled', null]) {
      const result = validateAliceCharacterManifest({ ...manifest, canonicalAssetStatus: status });
      expect(result.pass).toBe(false);
      expect(result.canPromote).toBe(false);
      expect(result.failures).toContain('invalid-canonical-asset-status');
    }
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

  it('rejects malformed candidateAssets without throwing', () => {
    const bad = { ...manifest, canonicalAssetStatus: 'approved', approvedAsset: { path: 'x.vrm' }, candidateAssets: [null, 42, { path: 'x.vrm' }] };
    expect(() => validateAliceCharacterManifest(bad)).not.toThrow();
    expect(validateAliceCharacterManifest(bad).canPromote).toBe(false);
    expect(validateAliceCharacterManifest({ ...bad, candidateAssets: [null] }).failures).toContain('approved-asset-not-registered-candidate');
  });

  it('verifies the SHA-256 of the actual asset bytes', async () => {
    const bytes = new TextEncoder().encode('synthetic-asset');
    const sha = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map((b) => b.toString(16).padStart(2, '0')).join('');
    const candidate = { ...manifest.candidateAssets[0], sha256: sha, assetAudit: { identityVerified: true, faceRigRuntimeVerified: true } };
    const approved = {
      ...manifest,
      canonicalAssetStatus: 'approved',
      approvedAsset: { path: candidate.path },
      candidateAssets: [candidate],
      approval: { approvedAt: '2026-11-09T08:00:00Z', approvedBy: 'synthetic', approvedChecksum: sha },
      promotionGate: { ...manifest.promotionGate, requiresRuntimeDiagnostics: true, requiresExplicitVersionBump: true },
    };
    expect((await verifyApprovedAssetIntegrity(approved, async () => bytes)).canPromote).toBe(true);
    const tampered = await verifyApprovedAssetIntegrity(approved, async () => new TextEncoder().encode('other'));
    expect(tampered.failures).toContain('asset-bytes-checksum-mismatch');
    const missing = await verifyApprovedAssetIntegrity(approved, async () => { throw new Error('enoent'); });
    expect(missing.failures).toContain('asset-unreadable');
  });

  it('rejects non-SHA-256 checksums and missing diagnostics/version-bump gates', () => {
    const base = { ...manifest, canonicalAssetStatus: 'approved',
      promotionGate: { ...manifest.promotionGate, requiresRuntimeDiagnostics: false, requiresExplicitVersionBump: false }, approvedAsset: { path: 'x.vrm' },
      approval: { approvedAt: 't', approvedBy: 'r', approvedChecksum: 'abc' },
      candidateAssets: [{ path: 'x.vrm', sha256: 'abc', assetAudit: { identityVerified: true, faceRigRuntimeVerified: true } }] };
    const r = validateAliceCharacterManifest(base);
    expect(r.failures).toEqual(expect.arrayContaining(['approved-candidate-missing-valid-sha256', 'approved-checksum-mismatch', 'missing-runtime-diagnostics-gate', 'missing-version-bump-gate']));
    expect(r.canPromote).toBe(false);
  });
});
