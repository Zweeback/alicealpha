import { describe, expect, it } from 'vitest';
import { createOperatorEnvelope, mayExecuteOperatorEnvelope, operatorAuditEvent } from '../server/operatorAudit.js';

describe('GitHub operator audit boundary', () => {
  it('creates a deterministic auditable envelope without credentials', () => {
    const envelope = createOperatorEnvelope({
      id: 'op-1',
      operation: 'file.update',
      repository: 'Zweeback/alicealpha',
      payload: { path: 'README.md', token: 'never-store-me', nested: { Authorization: 'Bearer nope' } },
    }, () => '2026-09-21T13:00:00.000Z');

    expect(envelope.id).toBe('op-1');
    expect(envelope.payload.token).toBe('[redacted]');
    expect(envelope.payload.nested.Authorization).toBe('[redacted]');
    expect(envelope.payload_sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(mayExecuteOperatorEnvelope(envelope)).toBe(true);
  });

  it('fails closed for operations outside the explicit allowlist', () => {
    expect(() => createOperatorEnvelope({ operation: 'secret.read', repository: 'Zweeback/alicealpha' }))
      .toThrow('operator-operation-not-allowed');
  });

  it('redacts failure details before they become audit material', () => {
    const envelope = createOperatorEnvelope({ id: 'op-2', operation: 'ci.verify', repository: 'Zweeback/alicealpha' });
    const event = operatorAuditEvent(envelope, 'failed', { error: '403', api_key: 'sensitive' });
    expect(event.status).toBe('failed');
    expect(event.detail.api_key).toBe('[redacted]');
  });
});
