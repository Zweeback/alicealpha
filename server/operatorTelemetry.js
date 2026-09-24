function compact(value) {
  return Array.isArray(value) ? value.join(',') : value;
}

export function buildOperatorSpan(envelope, control, phase, detail = {}) {
  if (!envelope?.id) throw new Error('operator-envelope-required');
  if (!control?.trace_id || !control?.risk) throw new Error('operator-control-required');
  if (!['policy.accepted', 'execution.started', 'execution.succeeded', 'execution.failed'].includes(phase)) {
    throw new Error('operator-telemetry-phase-invalid');
  }

  return Object.freeze({
    name: `alice.operator.${envelope.operation}`,
    trace_id: control.trace_id,
    phase,
    timestamp: new Date().toISOString(),
    attributes: Object.freeze({
      'alice.envelope.id': envelope.id,
      'alice.operation': envelope.operation,
      'alice.repository': envelope.repository,
      'alice.payload.sha256': envelope.payload_sha256,
      'alice.risk.level': control.risk.level,
      'alice.risk.approval_required': control.risk.approval_required,
      'alice.risk.signals': compact(control.risk.signals ?? []),
      'alice.failure.signatures': compact(control.risk.failure_signatures ?? []),
      'alice.failure.incidents': compact(control.risk.incident_patterns ?? []),
      'alice.failure.controls': compact(control.risk.required_controls ?? []),
      'alice.failure.registry_snapshot': control.risk.registry_snapshot ?? '',
      'alice.approval.actor': control.approval?.actor ?? '',
      ...detail,
    }),
  });
}

export function emitOperatorSpan(sink, span) {
  if (!sink) return false;
  if (typeof sink === 'function') {
    sink(span);
    return true;
  }
  if (typeof sink.emit === 'function') {
    sink.emit(span);
    return true;
  }
  throw new TypeError('operator-telemetry-sink-invalid');
}
