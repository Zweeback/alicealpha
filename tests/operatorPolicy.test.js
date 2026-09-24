import { describe, expect, it } from 'vitest';
import { createOperatorEnvelope } from '../server/operatorAudit.js';
import { classifyOperatorRisk, enforceOperatorPolicy } from '../server/operatorPolicy.js';

describe('incident-informed operator policy', () => {
  it('keeps branch creation low risk and exposes registry provenance', () => {
    const envelope = createOperatorEnvelope({
      id: 'branch-low-risk',
      operation: 'branch.create',
      repository: 'Zweeback/alicealpha',
      payload: { branch: 'probe', base_ref: 'main' },
    });

    const risk = classifyOperatorRisk(envelope);
    expect(risk.level).toBe('low');
    expect(risk.approval_required).toBe(false);
    expect(risk.registry_snapshot).toBe('2026-09-21');
  });

  it('treats merge as high risk even without an incident signature', () => {
    const envelope = createOperatorEnvelope({
      id: 'merge-high-risk',
      operation: 'pr.merge',
      repository: 'Zweeback/alicealpha',
      payload: { pull_number: 49 },
    });

    const risk = classifyOperatorRisk(envelope);
    expect(risk.level).toBe('high');
    expect(risk.approval_required).toBe(true);
    expect(risk.reasons).toContain('repository-history-write');
  });

  it('detects production targets through the registry', () => {
    const envelope = createOperatorEnvelope({
      id: 'prod-target-risk',
      operation: 'file.update',
      repository: 'Zweeback/alicealpha',
      payload: { path: 'server/db.js', environment: 'production' },
    });

    const risk = classifyOperatorRisk(envelope);
    expect(risk.level).toBe('high');
    expect(risk.failure_signatures).toContain('PROD_NOT_TEST_TARGET');
    expect(risk.incident_patterns).toContain('AIID-1672');
    expect(risk.incident_patterns).toContain('AIID-1676');
    expect(risk.required_controls).toContain('recovery_point');
  });

  it('detects credential-shaped payload keys after values have been redacted', () => {
    const envelope = createOperatorEnvelope({
      id: 'credential-risk',
      operation: 'file.create',
      repository: 'Zweeback/alicealpha',
      payload: { path: 'config.json', api_key: 'not-a-real-key' },
    });

    const risk = classifyOperatorRisk(envelope);
    expect(envelope.payload.api_key).toBe('[redacted]');
    expect(risk.level).toBe('high');
    expect(risk.failure_signatures).toContain('NO_SECRET_PROPAGATION');
    expect(risk.incident_patterns).toContain('AIID-1685');
  });

  it('promotes untrusted input to high risk using failure memory', () => {
    const envelope = createOperatorEnvelope({
      id: 'untrusted-source-risk',
      operation: 'pr.create',
      repository: 'Zweeback/alicealpha',
      payload: { head: 'probe', base: 'main', source_trust: 'untrusted' },
    });

    const risk = classifyOperatorRisk(envelope);
    expect(risk.level).toBe('high');
    expect(risk.failure_signatures).toContain('UNTRUSTED_CONTENT_NEVER_INSTRUCTION');
    expect(risk.incident_patterns).toContain('AIID-1680');
  });

  it('makes explicitly destructive work critical', () => {
    const envelope = createOperatorEnvelope({
      id: 'destructive-risk',
      operation: 'file.update',
      repository: 'Zweeback/alicealpha',
      payload: { path: 'data/state.json', destructive: true },
    });

    const risk = classifyOperatorRisk(envelope);
    expect(risk.level).toBe('critical');
    expect(risk.failure_signatures).toContain('DESTRUCTIVE_REQUIRES_RECOVERY_POINT');
    expect(risk.required_controls).toContain('snapshot_before_write');
  });

  it('fails closed when high-risk work has no human approval', () => {
    const envelope = createOperatorEnvelope({
      id: 'approval-required',
      operation: 'pr.merge',
      repository: 'Zweeback/alicealpha',
      payload: { pull_number: 49 },
    });

    expect(() => enforceOperatorPolicy(envelope)).toThrow('operator-approval-required');
    expect(() => enforceOperatorPolicy(envelope, { approval: { granted: true, actor: 'alice' } }))
      .toThrow('operator-approval-required');
  });

  it('allows high-risk work only with explicit human approval and preserves trace identity', () => {
    const envelope = createOperatorEnvelope({
      id: 'approved-risk',
      trace_id: 'trace.control-plane.1',
      operation: 'pr.merge',
      repository: 'Zweeback/alicealpha',
      payload: { pull_number: 49 },
    });

    const control = enforceOperatorPolicy(envelope, {
      approval: { granted: true, actor: 'human:benjamin' },
    });

    expect(control.trace_id).toBe('trace.control-plane.1');
    expect(control.approval.actor).toBe('human:benjamin');
    expect(control.risk.level).toBe('high');
  });
});
