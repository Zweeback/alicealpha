import { describe, expect, it } from 'vitest';
import { createEvidenceClaim, verifyEvidenceClaim } from '../server/evidenceLedger.js';
import { advanceKernelTask, createKernelTask, resumeKernelLoop } from '../server/autonomyKernel.js';

function verifiedClaim() {
  return verifyEvidenceClaim(createEvidenceClaim({
    type: 'test_result',
    claim: 'verification passed',
    sources: [{ ref: 'ci:1', trust: 'project' }],
  }), {
    status: 'verified',
    verifier: 'test:vitest',
    evidence: ['run:1'],
  });
}

describe('alice autonomy kernel', () => {
  it('runs the bounded loop and only remembers verified evidence', () => {
    let task = createKernelTask({ goal: 'build Alice' });
    for (const phase of ['observe', 'diagnose', 'retrieve']) {
      task = advanceKernelTask(task, { type: `${phase}.complete` });
    }
    task = advanceKernelTask(task, { type: 'plan.complete', detail: { operator_control: { allowed: true } } });
    task = advanceKernelTask(task, { type: 'execute.complete' });
    task = advanceKernelTask(task, { type: 'verify.complete', detail: { verification: { passed: true } } });
    task = advanceKernelTask(task, { type: 'remember.complete', detail: { claims: [verifiedClaim()] } });

    expect(task.phase).toBe('select_next');
    expect(resumeKernelLoop(task, { type: 'next.none' }).phase).toBe('done');
  });

  it('fails closed on denied execution or failed verification', () => {
    let task = createKernelTask({ goal: 'unsafe plan' });
    for (const phase of ['observe', 'diagnose', 'retrieve']) {
      task = advanceKernelTask(task, { type: `${phase}.complete` });
    }
    expect(advanceKernelTask(task, {
      type: 'plan.complete',
      detail: { operator_control: { allowed: false } },
    }).phase).toBe('blocked');
  });
});
