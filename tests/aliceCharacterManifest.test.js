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
});
