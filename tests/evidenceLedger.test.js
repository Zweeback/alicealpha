import { describe, expect, it } from 'vitest';
import {
  createEvidenceClaim,
  createEvidenceLedger,
  mayEnterVerifiedMemory,
  verifyEvidenceClaim,
} from '../server/evidenceLedger.js';

describe('evidence ledger', () => {
  it('keeps generated claims candidate until externally verified', () => {
    const claim = createEvidenceClaim({
      type: 'test_result',
      claim: 'Alice kernel tests pass',
      sources: [{ ref: 'ci:alice-kernel:1', trust: 'project' }],
      payload: { suite: 'kernel' },
    });

    expect(claim.status).toBe('candidate');
    expect(mayEnterVerifiedMemory(claim)).toBe(false);

    const verified = verifyEvidenceClaim(claim, {
      status: 'verified',
      verifier: 'test:vitest',
      evidence: ['run:alice-kernel:1'],
    });

    expect(mayEnterVerifiedMemory(verified)).toBe(true);
    expect(createEvidenceLedger([claim, verified]).verified).toHaveLength(1);
  });

  it('forbids self-attestation and secret-shaped fields', () => {
    const claim = createEvidenceClaim({
      type: 'fact',
      claim: 'A capability exists',
      sources: [{ ref: 'repo:alicealpha', trust: 'project' }],
      payload: { capability: 'operator-policy' },
    });

    expect(() => verifyEvidenceClaim(claim, {
      status: 'verified',
      verifier: 'alice',
      evidence: ['self'],
    })).toThrow('evidence-self-attestation-forbidden');

    expect(() => createEvidenceClaim({
      type: 'artifact',
      claim: 'secret payload',
      sources: [{ ref: 'upload:1' }],
      payload: { api_key: 'never' },
    })).toThrow('evidence-secret-field-forbidden');
  });
});
