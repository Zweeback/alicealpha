import { createHash, randomUUID } from 'node:crypto';

const REQUIRED = ['what_happened', 'why_it_happened', 'remediation', 'prevention'];

function requireText(value, field) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`incident-response-${field}-required`);
  }
  return value.trim();
}

export function createIncidentResponse(input, now = () => new Date().toISOString()) {
  if (!input || typeof input !== 'object') throw new TypeError('incident-response-input-required');

  const response = {
    id: input.id || randomUUID(),
    created_at: now(),
    trace_id: input.trace_id || null,
    action_id: input.action_id || null,
    affected_target: input.affected_target || null,
    what_happened: requireText(input.what_happened, 'what-happened'),
    why_it_happened: requireText(input.why_it_happened, 'why-it-happened'),
    remediation: requireText(input.remediation, 'remediation'),
    prevention: requireText(input.prevention, 'prevention'),
    evidence: Array.isArray(input.evidence) ? [...input.evidence] : [],
    rollback: input.rollback ?? null,
    related_failure_signatures: Array.isArray(input.related_failure_signatures)
      ? [...new Set(input.related_failure_signatures)]
      : [],
    status: 'complete',
  };

  const canonical = JSON.stringify(Object.fromEntries(
    Object.entries(response).filter(([key]) => key !== 'sha256'),
  ));

  response.sha256 = createHash('sha256').update(canonical).digest('hex');
  return Object.freeze(response);
}

export function assertIncidentResponseComplete(response) {
  if (!response || response.status !== 'complete') throw new Error('incident-response-incomplete');
  for (const field of REQUIRED) requireText(response[field], field.replaceAll('_', '-'));
  if (!/^[a-f0-9]{64}$/.test(response.sha256 || '')) throw new Error('incident-response-hash-invalid');
  return true;
}
