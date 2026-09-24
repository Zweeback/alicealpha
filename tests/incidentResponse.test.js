import { describe, expect, it } from 'vitest';
import { assertIncidentResponseComplete, createIncidentResponse } from '../server/incidentResponse.js';

describe('internal incident response contract', () => {
  it('requires what, why, remediation and prevention', () => {
    expect(() => createIncidentResponse({
      what_happened: 'A write targeted the wrong environment.',
      why_it_happened: 'Target identity was not verified.',
      remediation: 'The write was rolled back.',
    })).toThrow('incident-response-prevention-required');
  });

  it('creates a hashed complete response with failure-memory links', () => {
    const response = createIncidentResponse({
      id: 'incident-response-1',
      trace_id: 'trace.control-plane.1',
      affected_target: 'staging/database',
      what_happened: 'A proposed migration resolved to a production-like target.',
      why_it_happened: 'Environment metadata was ambiguous.',
      remediation: 'Execution was blocked before the write.',
      prevention: 'Require explicit environment identity and recovery point.',
      evidence: ['policy-deny'],
      related_failure_signatures: ['PROD_NOT_TEST_TARGET'],
    }, () => '2026-09-24T00:00:00.000Z');

    expect(response.status).toBe('complete');
    expect(response.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(response.related_failure_signatures).toEqual(['PROD_NOT_TEST_TARGET']);
    expect(assertIncidentResponseComplete(response)).toBe(true);
  });
});
