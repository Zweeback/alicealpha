import { describe, expect, it, vi } from 'vitest';
import { assertTurnActive, PersonaRuntime } from '../src/core/runtime.js';

describe('Alice runtime cancellation boundary', () => {
  it('throws an AbortError for an already cancelled signal', () => {
    const controller = new AbortController();
    controller.abort();
    expect(() => assertTurnActive(controller.signal)).toThrowError(/cancelled/);
    expect(() => assertTurnActive()).not.toThrow();
  });

  it('does not invoke local persona for a previously aborted user turn', async () => {
    const memory = { recent: () => [] };
    const runtime = new PersonaRuntime(memory, null, null);
    runtime.local.respond = vi.fn();
    const controller = new AbortController();
    controller.abort();
    await expect(runtime.respond('Geisterantwort', controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(runtime.local.respond).not.toHaveBeenCalled();
  });

  it('does not revive an aborted backend request as a local reply', async () => {
    const memory = { recent: () => [] };
    const runtime = new PersonaRuntime(memory, '/api/chat', null);
    runtime.local.respond = vi.fn();
    const oldFetch = globalThis.fetch;
    const controller = new AbortController();
    globalThis.fetch = vi.fn(async () => {
      controller.abort();
      throw new Error('network request aborted');
    });
    try {
      await expect(runtime.respond('Alte Frage', controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
      expect(runtime.local.respond).not.toHaveBeenCalled();
    } finally {
      globalThis.fetch = oldFetch;
    }
  });
});
