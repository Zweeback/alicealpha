import { describe, expect, it, vi } from 'vitest';
import { createOperatorEnvelope } from '../server/operatorAudit.js';
import { dispatchOperatorEnvelope } from '../server/operatorDispatch.js';

describe('operator dispatch telemetry integration', () => {
  it('emits policy, start and success phases for a verified execution', async () => {
    const envelope = createOperatorEnvelope({
      id: 'dispatch-telemetry',
      operation: 'branch.create',
      repository: 'Zweeback/alicealpha',
      payload: { branch: 'telemetry-probe', base_ref: 'main' },
    });
    const sink = vi.fn();
    const executor = vi.fn(async () => ({ branch: 'telemetry-probe' }));

    const result = await dispatchOperatorEnvelope(envelope, executor, { telemetry: sink });

    expect(result.completed.status).toBe('succeeded');
    expect(sink).toHaveBeenCalledTimes(3);
    expect(sink.mock.calls.map(([span]) => span.phase)).toEqual([
      'policy.accepted',
      'execution.started',
      'execution.succeeded',
    ]);
    expect(sink.mock.calls[0][0].trace_id).toBe('alice.operator.dispatch-telemetry');
  });
});
