import { describe, expect, it } from 'vitest';
import { buildAliceKernelSnapshot, buildCapabilityRegistry } from '../server/capabilityRegistry.js';

describe('Alice capability registry', () => {
  it('reports provider-backed capabilities as unconfigured without server credentials', () => {
    const registry = buildCapabilityRegistry({});
    const byId = Object.fromEntries(registry.capabilities.map((item) => [item.id, item]));

    expect(byId['persona.core'].status).toBe('ready');
    expect(byId['inference.browser'].status).toBe('client');
    expect(byId['inference.ollama'].status).toBe('unconfigured');
    expect(byId['realtime.webrtc'].status).toBe('unconfigured');
    expect(byId['operator.github'].status).toBe('bounded');
  });

  it('reports configured server transports without exposing credential values', () => {
    const env = {
      OPENAI_API_KEY: 'super-secret-key',
      ALICE_OLLAMA_URL: 'http://ollama.internal:11434',
      RENDER_GIT_COMMIT: 'abc123',
    };

    const snapshot = buildAliceKernelSnapshot(env, () => '2026-09-25T00:30:00.000Z');
    const serialized = JSON.stringify(snapshot);
    const byId = Object.fromEntries(snapshot.capability_registry.capabilities.map((item) => [item.id, item]));

    expect(byId['inference.ollama'].status).toBe('configured');
    expect(byId['realtime.webrtc'].status).toBe('configured');
    expect(snapshot.revision).toBe('abc123');
    expect(snapshot.generated_at).toBe('2026-09-25T00:30:00.000Z');
    expect(serialized).not.toContain('super-secret-key');
    expect(serialized).not.toContain('ollama.internal');
  });

  it('publishes the control-plane invariants and execution law as machine-readable state', () => {
    const snapshot = buildAliceKernelSnapshot({}, () => '2026-09-25T00:30:00.000Z');

    expect(snapshot.identity).toBe('alice');
    expect(snapshot.kernel).toBe('0.3.1');
    expect(snapshot.control_plane).toBe('v2');
    expect(snapshot.execution_law).toEqual([
      'observe',
      'propose',
      'classify-risk',
      'verify-target',
      'authorize',
      'execute',
      'verify-result',
      'journal',
      'rollback-or-close',
    ]);
    expect(snapshot.invariants.high_risk_writes_require_human_approval).toBe(true);
  });
});
