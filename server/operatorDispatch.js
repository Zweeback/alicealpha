import { mayExecuteOperatorEnvelope, operatorAuditEvent } from './operatorAudit.js';

const EXECUTORS = new Set(['branch.create']);

function verifyExecutorResult(envelope, result) {
  if (envelope.operation === 'branch.create') {
    if (!result || result.branch !== envelope.payload.branch) {
      throw new Error('operator-executor-result-mismatch');
    }
  }
}

export async function dispatchOperatorEnvelope(envelope, executor) {
  if (!mayExecuteOperatorEnvelope(envelope)) throw new Error('operator-envelope-not-executable');
  if (!EXECUTORS.has(envelope.operation)) throw new Error('operator-executor-not-supported');
  if (typeof executor !== 'function') throw new TypeError('operator-executor-required');

  const accepted = operatorAuditEvent(envelope, 'accepted');
  try {
    const result = await executor({
      operation: envelope.operation,
      repository: envelope.repository,
      payload: envelope.payload,
      payload_sha256: envelope.payload_sha256,
    });
    verifyExecutorResult(envelope, result);
    return { accepted, completed: operatorAuditEvent(envelope, 'succeeded', { result }) };
  } catch (error) {
    return {
      accepted,
      completed: operatorAuditEvent(envelope, 'failed', {
        error: error instanceof Error ? error.message : String(error),
      }),
    };
  }
}
