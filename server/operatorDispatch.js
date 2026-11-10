import { mayExecuteOperatorEnvelope, operatorAuditEvent } from './operatorAudit.js';
import { enforceOperatorPolicy } from './operatorPolicy.js';
import { buildOperatorSpan, emitOperatorSpan } from './operatorTelemetry.js';

const EXECUTORS = new Set([
  'branch.create',
  'file.create',
  'file.update',
  'pr.create',
  'ci.verify',
  'pr.merge',
]);

function requireString(value, code) {
  if (typeof value !== 'string' || value.length === 0) throw new Error(code);
}

function verifyExecutorResult(envelope, result) {
  if (!result || typeof result !== 'object') throw new Error('operator-executor-result-mismatch');

  if (envelope.operation === 'branch.create') {
    if (result.branch !== envelope.payload.branch) throw new Error('operator-executor-result-mismatch');
    return;
  }

  if (envelope.operation === 'file.create' || envelope.operation === 'file.update') {
    requireString(result.commit_sha, 'operator-executor-result-mismatch');
    return;
  }

  if (envelope.operation === 'pr.create') {
    if (!Number.isInteger(result.number) || result.number <= 0) throw new Error('operator-executor-result-mismatch');
    return;
  }

  if (envelope.operation === 'ci.verify') {
    if (result.status !== 'success') throw new Error('operator-ci-not-successful');
    if (envelope.payload?.head_sha && result.head_sha !== envelope.payload.head_sha) {
      throw new Error('operator-ci-head-mismatch');
    }
    return;
  }

  if (envelope.operation === 'pr.merge') {
    if (result.merged !== true) throw new Error('operator-executor-result-mismatch');
  }
}

function requireSafeMergePolicy(envelope, policy) {
  if (envelope.operation !== 'pr.merge') return;
  const shaBound = Boolean(
    policy?.expectedHeadSha
    && policy?.currentHeadSha
    && policy.expectedHeadSha === policy.currentHeadSha,
  );
  if (!policy || policy.ci !== 'success' || (policy.protected !== true && !shaBound)) {
    throw new Error('operator-merge-policy-not-satisfied');
  }
}

function telemetry(options, envelope, control, phase, detail = {}) {
  if (!options.telemetry) return;
  emitOperatorSpan(options.telemetry, buildOperatorSpan(envelope, control, phase, detail));
}

export async function dispatchOperatorEnvelope(envelope, executor, options = {}) {
  if (!mayExecuteOperatorEnvelope(envelope)) throw new Error('operator-envelope-not-executable');
  if (!EXECUTORS.has(envelope.operation)) throw new Error('operator-executor-not-supported');
  if (typeof executor !== 'function') throw new TypeError('operator-executor-required');

  const control = enforceOperatorPolicy(envelope, options);
  requireSafeMergePolicy(envelope, options.mergePolicy);

  telemetry(options, envelope, control, 'policy.accepted');

  const accepted = operatorAuditEvent(envelope, 'accepted', {
    risk: control.risk,
    approval: control.approval,
  });

  try {
    telemetry(options, envelope, control, 'execution.started');
    const result = await executor({
      operation: envelope.operation,
      repository: envelope.repository,
      payload: envelope.payload,
      payload_sha256: envelope.payload_sha256,
      trace_id: control.trace_id,
      risk: control.risk,
    });
    verifyExecutorResult(envelope, result);
    telemetry(options, envelope, control, 'execution.succeeded', {
      'alice.execution.verified': true,
    });
    return {
      accepted,
      completed: operatorAuditEvent(envelope, 'succeeded', {
        risk: control.risk,
        result,
      }),
    };
  } catch (error) {
    telemetry(options, envelope, control, 'execution.failed', {
      'alice.execution.error': error instanceof Error ? error.message : String(error),
    });
    return {
      accepted,
      completed: operatorAuditEvent(envelope, 'failed', {
        risk: control.risk,
        error: error instanceof Error ? error.message : String(error),
      }),
    };
  }
}
