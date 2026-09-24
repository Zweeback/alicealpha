import { describe, expect, it } from 'vitest';
import {
  getFailureRegistry,
  getFailureRegistryMetadata,
  matchFailureSignatures,
  summarizeFailureMatches,
} from '../server/failureRegistry.js';

describe('AIID failure registry', () => {
  it('loads the eight supplied weekly snapshots with provenance hashes', () => {
    const registry = getFailureRegistry();
    const meta = getFailureRegistryMetadata();

    expect(meta.schema_version).toBe('1.0.0');
    expect(meta.latest_snapshot).toBe('2026-09-21');
    expect(meta.latest_counts).toEqual({ incidents: 1689, reports: 7791 });
    expect(meta.snapshots).toBe(8);
    expect(registry.snapshot_manifest[0].incidents).toBe(1605);
    expect(registry.snapshot_manifest.at(-1).new_incidents).toBe(14);
    for (const snapshot of registry.snapshot_manifest) {
      expect(snapshot.sha256).toMatch(/^[a-f0-9]{64}$/);
    }
  });

  it('maps production-target signals to historical failure memory and controls', () => {
    const matches = matchFailureSignatures(['production-target']);
    expect(matches.map((item) => item.id)).toContain('PROD_NOT_TEST_TARGET');

    const summary = summarizeFailureMatches(['production-target']);
    expect(summary.severity).toBe('high');
    expect(summary.incident_ids).toContain(1672);
    expect(summary.incident_ids).toContain(1676);
    expect(summary.controls).toContain('environment_identity_check');
  });

  it('takes the strongest severity across multiple matching signatures', () => {
    const summary = summarizeFailureMatches(['credential-boundary', 'network-egress']);
    expect(summary.severity).toBe('critical');
    expect(summary.signature_ids).toContain('NO_SECRET_PROPAGATION');
    expect(summary.signature_ids).toContain('NO_UNAUTHORIZED_EGRESS');
  });
});
