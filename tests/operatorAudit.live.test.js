import { describe, expect, it } from 'vitest';
import { createOperatorEnvelope, mayExecuteOperatorEnvelope, operatorAuditEvent } from '../server/operatorAudit.js';

describe('live GitHub operator audit proof', () => {
  it('models a real branch-create job without leaking connector credentials', () => {
    const envelope = createOperatorEnvelope({
      id: 'live-branch-create-proof',
      operation: 'branch.create',
      repository: 'Zweeback/alicealpha',
      payload: {
        branch: 'operator-live-audit-proof',
        base_ref: 'main',
        authorization: 'connector-owned-secret-must-not-cross-boundary',
      },
    }, () => '2026-09-21T14:09:37.000Z');

    expect(mayExecuteOperatorEnvelope(envelope)).toBe(true);
    expect(envelope.payload.authorization).toBe('[redacted]');
    expect(envelope.payload_sha256).toMatch(/^[a-f0-9]{64}$/);

    const accepted = operatorAuditEvent(envelope, 'accepted', { executor: 'github-mcp' });
    const succeeded = operatorAuditEvent(envelope, 'succeeded', {
      branch: 'operator-live-audit-proof',
      token: 'must-not-be-audited',
    });

    expect(accepted).toMatchObject({
      envelope_id: 'live-branch-create-proof',
      operation: 'branch.create',
      repository: 'Zweeback/alicealpha',
      status: 'accepted',
    });
    expect(succeeded.detail.branch).toBe('operator-live-audit-proof');
    expect(succeeded.detail.token).toBe('[redacted]');
  });
});
