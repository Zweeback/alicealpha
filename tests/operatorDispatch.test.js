import { describe, expect, it, vi } from 'vitest';
import { createOperatorEnvelope } from '../server/operatorAudit.js';
import { dispatchOperatorEnvelope } from '../server/operatorDispatch.js';

describe('operator dispatch boundary', () => {
  it('dispatches only a validated branch.create envelope and redacts executor result secrets', async () => {
    const envelope = createOperatorEnvelope({
      id: 'dispatch-proof',
      operation: 'branch.create',
      repository: 'Zweeback/alicealpha',
      payload: { branch: 'probe', base_ref: 'main', authorization: 'Bearer fake-secret' },
    }, () => '2026-09-21T16:00:00.000Z');
    const executor = vi.fn(async (job) => ({ branch: job.payload.branch, github_token: 'fake-result-secret' }));

    const result = await dispatchOperatorEnvelope(envelope, executor);

    expect(executor).toHaveBeenCalledOnce();
    expect(executor.mock.calls[0][0].payload.authorization).toBe('[redacted]');
    expect(result.accepted.status).toBe('accepted');
    expect(result.completed.status).toBe('succeeded');
    expect(result.completed.detail.result.github_token).toBe('[redacted]');
  });

  it('marks branch.create failed when the executor reports a different branch', async () => {
    const envelope = createOperatorEnvelope({
      id: 'dispatch-result-mismatch',
      operation: 'branch.create',
      repository: 'Zweeback/alicealpha',
      payload: { branch: 'expected-probe', base_ref: 'main' },
    }, () => '2026-09-21T21:15:00.000Z');
    const executor = vi.fn(async () => ({ branch: 'unexpected-probe' }));

    const result = await dispatchOperatorEnvelope(envelope, executor);

    expect(executor).toHaveBeenCalledOnce();
    expect(result.accepted.status).toBe('accepted');
    expect(result.completed.status).toBe('failed');
    expect(result.completed.detail.error).toBe('operator-executor-result-mismatch');
  });

  it('fails closed for an unvalidated envelope', async () => {
    await expect(dispatchOperatorEnvelope({ operation: 'branch.create', repository: 'Zweeback/alicealpha' }, vi.fn()))
      .rejects.toThrow('operator-envelope-not-executable');
  });

  it('does not invoke the executor for a validated but unsupported operation', async () => {
    const envelope = createOperatorEnvelope({
      id: 'unsupported-dispatch-proof',
      operation: 'pr.create',
      repository: 'Zweeback/alicealpha',
      payload: { head: 'probe', base: 'main' },
    }, () => '2026-09-21T19:10:00.000Z');
    const executor = vi.fn();

    await expect(dispatchOperatorEnvelope(envelope, executor))
      .rejects.toThrow('operator-executor-not-supported');
    expect(executor).not.toHaveBeenCalled();
  });

  it('does not invoke the executor for pr.merge without successful CI and branch protection', async () => {
    const envelope = createOperatorEnvelope({
      id: 'unsafe-merge-proof',
      operation: 'pr.merge',
      repository: 'Zweeback/alicealpha',
      payload: { pull_number: 48 },
    }, () => '2026-09-22T05:09:00.000Z');
    const executor = vi.fn();

    await expect(dispatchOperatorEnvelope(envelope, executor, {
      mergePolicy: { ci: 'success', protected: false },
    })).rejects.toThrow('operator-merge-policy-not-satisfied');
    expect(executor).not.toHaveBeenCalled();
  });
});
