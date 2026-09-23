import { createHash, randomUUID } from 'node:crypto';

const ALLOWED_OPERATIONS = new Set(['branch.create', 'file.create', 'file.update', 'pr.create', 'ci.verify', 'pr.merge']);
const SECRET_KEY = /(token|secret|password|cookie|authorization|api[_-]?key|credential)/i;

function redact(value) {
  if (Array.isArray(value)) return value.map(redact);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, SECRET_KEY.test(key) ? '[redacted]' : redact(item)]));
}

export function createOperatorEnvelope(input, now = () => new Date().toISOString()) {
  if (!input || typeof input !== 'object') throw new TypeError('operator-input-required');
  if (!ALLOWED_OPERATIONS.has(input.operation)) throw new Error('operator-operation-not-allowed');
  if (!input.repository || !/^[^/]+\/[^/]+$/.test(input.repository)) throw new Error('operator-repository-invalid');

  const id = input.id || randomUUID();
  const traceId = input.trace_id || `alice.operator.${id}`;
  if (typeof traceId !== 'string' || traceId.length === 0) throw new Error('operator-trace-id-invalid');

  const payload = redact(input.payload ?? {});
  const canonical = JSON.stringify({ operation: input.operation, repository: input.repository, payload });
  return Object.freeze({
    id,
    trace_id: traceId,
    created_at: now(),
    operation: input.operation,
    repository: input.repository,
    payload,
    payload_sha256: createHash('sha256').update(canonical).digest('hex'),
    status: 'proposed',
  });
}

export function operatorAuditEvent(envelope, status, detail = {}) {
  if (!envelope?.id) throw new Error('operator-envelope-required');
  if (!['accepted', 'running', 'succeeded', 'failed'].includes(status)) throw new Error('operator-status-invalid');
  return Object.freeze({
    envelope_id: envelope.id,
    trace_id: envelope.trace_id || `alice.operator.${envelope.id}`,
    operation: envelope.operation,
    repository: envelope.repository,
    status,
    detail: redact(detail),
  });
}

export function mayExecuteOperatorEnvelope(envelope) {
  return Boolean(envelope && envelope.status === 'proposed' && ALLOWED_OPERATIONS.has(envelope.operation) && envelope.repository);
}
