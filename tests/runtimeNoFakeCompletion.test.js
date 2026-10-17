import { describe, expect, it } from 'vitest';
import { MemoryStore } from '../src/core/memory.js';
import { PersonaRuntime } from '../src/core/runtime.js';

const storage = () => ({ getItem: () => null, setItem: () => undefined });

describe('PersonaRuntime unavailable-model behavior', () => {
  it('rejects general questions instead of returning a scripted reply as AI output', async () => {
    const runtime = new PersonaRuntime(new MemoryStore(storage()), null);
    expect(runtime.browserAIReady).toBe(false);
    await expect(runtime.respond('Wie funktioniert die Live-Anbindung?'))
      .rejects.toThrow('no-operational-model');
  });

  it('still allows genuine local memory confirmation without an AI model', async () => {
    const memory = new MemoryStore(storage());
    const runtime = new PersonaRuntime(memory, null);
    const proposal = await runtime.respond('Merk dir: Die Prüfung muss echt sein');
    expect(proposal.source).toBe('local-memory');
    expect(proposal.candidate?.status).toBe('candidate');
    expect(memory.confirmed()).toHaveLength(0);
    const confirmed = await runtime.respond('Ja, bitte bestätigen');
    expect(confirmed.source).toBe('local-memory');
    expect(memory.confirmed()).toHaveLength(1);
  });
});
