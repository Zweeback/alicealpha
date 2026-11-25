import { describe, expect, it } from 'vitest';
import {
  createLocalObservabilityStore,
  canReadLocalObservability,
} from '../server/localObservability.js';

const attempt = {
  provider: 'gemini',
  model: 'gemini-2.5-flash',
  outcome: 'success',
  startedAt: '2026-11-17T08:00:00.000Z',
  completedAt: '2026-11-17T08:00:00.320Z',
  usage: { input_tokens: 12, output_tokens: 4, total_tokens: 16 },
};

describe('Alice in-memory observability without Grafana', () => {
  it('counts sanitized provider attempts without retaining prompts, replies, IDs or secrets', () => {
    const store = createLocalObservabilityStore({ maxEvents: 2 });
    expect(store.record({
      ...attempt, text: 'SECRET PROMPT', reply: 'SECRET REPLY',
      conversationId: 'SECRET ID', apiKey: 'SECRET KEY',
    })).toBe(true);
    expect(store.record({
      ...attempt, provider: 'groq', model: 'llama-3.3',
      outcome: 'error', error: 'SECRET ERROR',
      completedAt: '2026-11-17T08:00:01.000Z',
    })).toBe(true);
    const snapshot = store.snapshot();
    expect(snapshot).toMatchObject({
      storage: 'memory',
      count: 2,
      success: 1,
      error: 1,
      totalDurationMs: 1320,
      reportedTokens: { input: 24, output: 8, total: 32 },
    });
    expect(snapshot.events[0]).toMatchObject({ provider: 'gemini', model: 'gemini-2.5-flash', durationMs: 320 });
    expect(JSON.stringify(snapshot)).not.toMatch(/SECRET|conversationId|apiKey|prompt|reply/i);
  });

  it('enforces a bounded window and treats missing token usage as unknown', () => {
    const store = createLocalObservabilityStore({ maxEvents: 1 });
    store.record({ ...attempt, usage: undefined });
    store.record({ ...attempt, outcome: 'error', usage: undefined });
    expect(store.snapshot()).toMatchObject({
      storage: 'memory', count: 1, success: 0, error: 1,
      reportedTokens: { input: 0, output: 0, total: 0 },
      attemptsWithReportedUsage: 0,
    });
  });

  it('rejects malformed attempts without throwing or capturing strings', () => {
    const store = createLocalObservabilityStore();
    expect(store.record({ text: 'SECRET', provider: null })).toBe(false);
    expect(store.record({ ...attempt, startedAt: 'not-a-date' })).toBe(false);
    expect(store.snapshot().count).toBe(0);
  });

  const req = (remoteAddress, headers = {}) => ({
    socket: { remoteAddress },
    get: (name) => headers[name.toLowerCase()],
  });
  const LOCAL_ON = { ALICE_OBSERVABILITY_ALLOW_LOCAL_UNAUTH: '1' };

  it('denies token-free loopback access by default', () => {
    expect(canReadLocalObservability(req('127.0.0.1'), {})).toBe(false);
    expect(canReadLocalObservability(req('::1'), {})).toBe(false);
    expect(canReadLocalObservability(req('127.0.0.1'), { ALICE_OBSERVABILITY_ALLOW_LOCAL_UNAUTH: '0' })).toBe(false);
    expect(canReadLocalObservability(req('127.0.0.1'), { ALICE_OBSERVABILITY_ALLOW_LOCAL_UNAUTH: 'true' })).toBe(false);
    expect(canReadLocalObservability(req('127.0.0.1'), { ALICE_OBSERVABILITY_ALLOW_LOCAL_UNAUTH: '' })).toBe(false);
  });

  it('permits direct loopback clients only when explicitly enabled', () => {
    expect(canReadLocalObservability(req('127.0.0.1'), LOCAL_ON)).toBe(true);
    expect(canReadLocalObservability(req('::1'), LOCAL_ON)).toBe(true);
    expect(canReadLocalObservability(req('::ffff:127.0.0.1'), LOCAL_ON)).toBe(true);
    expect(canReadLocalObservability(req('192.168.1.8'), LOCAL_ON)).toBe(false);
    // Proxy headers must NOT make a public request appear local.
    expect(canReadLocalObservability(req('10.0.0.1', { 'x-forwarded-for': '127.0.0.1' }), LOCAL_ON)).toBe(false);
  });

  it.each([
    ['x-forwarded-for', '203.0.113.7'],
    ['x-forwarded-for', '127.0.0.1'],
    ['forwarded', 'for=127.0.0.1'],
    ['x-real-ip', '127.0.0.1'],
    ['cf-connecting-ip', '127.0.0.1'],
    ['x-forwarded-for', ''],
  ])('never treats loopback with %s header as local, even when enabled', (name, value) => {
    expect(canReadLocalObservability(req('127.0.0.1', { [name]: value }), LOCAL_ON)).toBe(false);
    expect(canReadLocalObservability(req('::1', { [name]: value }), LOCAL_ON)).toBe(false);
  });

  it('still allows a valid bearer token through a proxy', () => {
    const secret = 'example-test-secret-32-characters-00002';
    const request = req('127.0.0.1', { 'x-forwarded-for': '203.0.113.7', authorization: 'Bearer ' + secret });
    expect(canReadLocalObservability(request, { ALICE_OBSERVABILITY_READ_TOKEN: secret })).toBe(true);
  });

  it('permits remote read with an explicitly configured strong secret only', () => {
    const secret = 'example-test-secret-32-characters-00001';
    const request = (token) => ({
      socket: { remoteAddress: '10.0.0.1' },
      get: (name) => name === 'authorization' ? token : undefined,
    });
    expect(canReadLocalObservability(request('Bearer ' + secret), { ALICE_OBSERVABILITY_READ_TOKEN: secret })).toBe(true);
    expect(canReadLocalObservability(request('Bearer incorrect'), { ALICE_OBSERVABILITY_READ_TOKEN: secret })).toBe(false);
    expect(canReadLocalObservability(request('Bearer short'), { ALICE_OBSERVABILITY_READ_TOKEN: 'short' })).toBe(false);
  });
});
