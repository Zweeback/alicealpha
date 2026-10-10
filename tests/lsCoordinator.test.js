import { describe, it, expect } from 'vitest';
import { LS_CAPABILITIES, createCapabilityFrame, clearanceForAsset } from '../src/core/lsCoordinator.js';

describe('LS capability frame / clearance', () => {
  it('never treats an owned subscription as a verified live connector', () => {
    expect(createCapabilityFrame().sources).toHaveLength(LS_CAPABILITIES.length);
    expect(createCapabilityFrame().sources.find(s => s.id === 'jules').status).toBe('pending');
    const frame = createCapabilityFrame({ claude: { status: 'verified' } });
    expect(frame.sources.find(s => s.id === 'claude').status).toBe('pending');
  });
  it('accepts scoped runtime evidence and preserves the provenance', () => {
    const frame = createCapabilityFrame({ github: { status: 'verified', evidence: 'PR #112: checks successful' } }, '2026-10-10T00:00:00Z');
    expect(frame.sources.find(s => s.id === 'github')).toMatchObject({ status: 'verified', evidence: 'PR #112: checks successful' });
    expect(frame.capturedAt).toBe('2026-10-10T00:00:00Z');
  });
  it('fails closed for an unrigged candidate without visual review', () => {
    const result = clearanceForAsset({ path: '/avatars/alice-trellis.glb', sha256: 'abc', rigged: false });
    expect(result.approved).toBe(false);
    expect(result.issues).toContain('facial-rig-unverified');
  });
  it('supports verified gated promotion only with evidence', () => {
    const result = clearanceForAsset({ path: '/approved.glb', sha256: 'sha', rigged: true }, {
      manifest: { approvedAsset: '/approved.glb', approval: { status: 'approved' } },
      visualReview: { status: 'pass', evidence: 'signed-user-visual-review' },
    });
    expect(result).toEqual({ approved: true, issues: [] });
  });
});
