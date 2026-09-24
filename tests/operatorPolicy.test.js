import { describe, expect, it } from 'vitest';
import { createOperatorEnvelope } from '../server/operatorAudit.js';
import { classifyOperatorRisk, enforceOperatorPolicy } from '../server/operatorPolicy.js';

describe('incident-informed operator policy', () => {
  it('keeps branch creation low risk and does not require approval', () => {
    const envelope = createOperatorEnvelope({
      id: 'branch-low-risk',
      operation: 'branch.create',
      repository: 'Zweeback/alicealpha',
      payload: { branch: 'probe', base_ref: 'main' },
    });

    const risk = classifyOperatorRisk(envelope);
    expect(risk.level).toBe('low');
    expect(risk.approval_required).toBe(false);
  });

  it('treats merge as high risk and links it to supply-chain write history', () => {
    const envelope = createOperatorEnvelope({
      id: 'merge-high-risk',
      operation: 'pr.merge',
      repository: 'Zweeback/alicealpha',
      payload: { pull_number: 49 },
    });

    const risk = classifyOperatorRisk(envelope);
    expect(risk.level).toBe('high');
    expect(risk.approval_required).toBe(true);
    expect(risk.incident_patterns).toContain('AIID-1680:supply-chain-write');
  });

  it('detects production targets and carries database incident patterns', () => {
    const envelope = createOperatorEnvelope({
      id: 'prod-target-risk',
      operation: 'file.update',
      repository: 'Zweeback/alicealpha',
      payload: { path: 'server/db.js', environment: 'production' },
    });

    const risk = classifyOperatorRisk(envelope);
    expect(risk.level).toBe('high');
    expect(risk.incident_patterns).toContain('AIID-1672:production-target-confusion');
    expect(risk.incident_patterns).toContain('AIID-1676:production-database-reset');
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
    expect(risk.incident_patterns).toContain('AIID-1685:credential-propagation');
  });

  it('marks explicitly untrusted input as elevated', () => {
    const envelope = createOperatorEnvelope({
      id: 'untrusted-source-risk',
      operation: 'pr.create',
      repository: 'Zweeback/alicealpha',
      payload: { head: 'probe', base: 'main', source_trust: 'untrusted' },
    });

    const risk = classifyOperatorRisk(envelope);
    expect(risk.level).toBe('elevated');
    expect(risk.incident_patterns).toContain('AIID-1680:prompt-injection-supply-chain');
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

  it('allows high-risk work only with an explicit human approval and preserves trace identity', () => {
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
