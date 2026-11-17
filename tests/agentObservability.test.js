import { describe, expect, it, vi } from 'vitest';
import {
  buildAgentGeneration,
  createAgentObservabilityReporter,
  isAgentObservabilityConfigured,
} from '../server/agentObservability.js';

const attempt = {
  provider: 'gemini',
  model: 'gemini-2.5-flash',
  outcome: 'success',
  startedAt: '2026-11-17T06:00:00.000Z',
  completedAt: '2026-11-17T06:00:01.200Z',
  usage: { input_tokens: 11, output_tokens: 5, total_tokens: 16 },
};

describe('Alice Grafana generation export', () => {
  it('builds valid metadata-only generations without conversation text', () => {
    const generation = buildAgentGeneration(
      { ...attempt, text: 'PRIVATE PROMPT', reply: 'PRIVATE ANSWER', token: 'PRIVATE TOKEN' },
      { conversationId: 'conv-1', generationId: 'gen-1', agentVersion: '0.3.0' },
    );

    expect(generation).toMatchObject({
      id: 'gen-1',
      conversation_id: 'conv-1',
      model: { provider: 'gemini', name: 'gemini-2.5-flash' },
      mode: 'GENERATION_MODE_SYNC',
      started_at: attempt.startedAt,
      completed_at: attempt.completedAt,
      agent_name: 'alice-alpha-chat',
      agent_version: '0.3.0',
      usage: attempt.usage,
      tags: { 'alice.route': '/api/chat', 'alice.outcome': 'success' },
    });
    expect(JSON.stringify(generation)).not.toMatch(/PRIVATE|system_prompt|"input"|"output"/);
  });

  it('marks failed provider calls without exposing upstream error messages', () => {
    const generation = buildAgentGeneration({
      ...attempt, outcome: 'error', errorType: 'http_429', error: 'PRIVATE ERROR',
    }, { conversationId: 'conv-2', generationId: 'gen-2' });
    expect(generation.call_error).toBe('alice_http_429');
    expect(JSON.stringify(generation)).not.toContain('PRIVATE ERROR');
  });

  it('does not send anything without complete credentials', async () => {
    const fetchFn = vi.fn();
    expect(isAgentObservabilityConfigured({ AGENTO11Y_ENDPOINT: 'https://example.com' })).toBe(false);
    const report = createAgentObservabilityReporter({ env: {}, fetchFn });
    expect(await report(attempt)).toBe(false);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('exports one generation using TLS, basic auth and the Grafana ingest endpoint', async () => {
    const fetchFn = vi.fn(async () => ({
      ok: true,
      json: async () => ({ results: [{ generation_id: 'gen-1', accepted: true }] }),
    }));
    const env = {
      AGENTO11Y_ENDPOINT: 'https://agento11y-prod-eu-west-2.grafana.net',
      AGENTO11Y_AUTH_TENANT_ID: '1927138',
      AGENTO11Y_AUTH_TOKEN: 'dummy-secret-not-real',
    };
    const report = createAgentObservabilityReporter({ env, fetchFn });
    expect(await report({ ...attempt, conversationId: 'conv-1', generationId: 'gen-1' })).toBe(true);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, options] = fetchFn.mock.calls[0];
    expect(String(url)).toBe('https://agento11y-prod-eu-west-2.grafana.net/api/v1/generations:export');
    expect(options.method).toBe('POST');
    expect(options.headers.Authorization).toBe('Basic ' + Buffer.from('1927138:dummy-secret-not-real').toString('base64'));
    const body = JSON.parse(options.body);
    expect(body.generations).toHaveLength(1);
    expect(body.generations[0].id).toBe('gen-1');
    expect(JSON.stringify(body)).not.toContain('dummy-secret-not-real');
  });

  it('reports rejected exports as unverified and never fails the chat route', async () => {
    const fetchFn = vi.fn(async () => ({ ok: false, status: 401 }));
    const report = createAgentObservabilityReporter({
      env: {
        AGENTO11Y_ENDPOINT: 'https://agento11y-prod-eu-west-2.grafana.net',
        AGENTO11Y_AUTH_TENANT_ID: '1927138',
        AGENTO11Y_AUTH_TOKEN: 'dummy-secret-not-real',
      },
      fetchFn,
    });
    expect(await report(attempt)).toBe(false);
  });
});
