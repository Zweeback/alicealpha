import { describe, expect, it, vi } from 'vitest';
import { createOperatorEnvelope } from '../server/operatorAudit.js';
import { enforceOperatorPolicy } from '../server/operatorPolicy.js';
import { buildOperatorSpan, emitOperatorSpan } from '../server/operatorTelemetry.js';

describe('operator telemetry', () => {
  it('builds a vendor-neutral span carrying risk and failure-memory attributes', () => {
    const envelope = createOperatorEnvelope({
      id: 'telemetry-prod',
      trace_id: 'trace.telemetry.1',
      operation: 'file.update',
      repository: 'Zweeback/alicealpha',
      payload: { path: 'server/db.js', environment: 'production' },
    });
    const control = enforceOperatorPolicy(envelope, {
      approval: { granted: true, actor: 'human:test' },
    });

    const span = buildOperatorSpan(envelope, control, 'policy.accepted');

    expect(span.trace_id).toBe('trace.telemetry.1');
    expect(span.attributes['alice.risk.level']).toBe('high');
    expect(span.attributes['alice.failure.signatures']).toContain('PROD_NOT_TEST_TARGET');
    expect(span.attributes['alice.failure.incidents']).toContain('AIID-1672');
    expect(span.attributes['alice.failure.registry_snapshot']).toBe('2026-09-21');
  });

  it('emits through a function sink', () => {
    const sink = vi.fn();
    const span = { name: 'alice.operator.test', trace_id: 'trace', phase: 'execution.started', attributes: {} };
    expect(emitOperatorSpan(sink, span)).toBe(true);
    expect(sink).toHaveBeenCalledWith(span);
  });
});
