import { describe, expect, it } from 'vitest';
import { MemoryStore } from '../src/core/memory.js';

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
}

describe('MemoryStore', () => {
  it('keeps a proposal unconfirmed until the tribunal resolves it', async () => {
    const memory = new MemoryStore(memoryStorage());
    const candidate = await memory.propose('Mira ist mir wichtig', 'explicit-user-request');

    expect(candidate.status).toBe('candidate');
    expect(candidate.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(memory.confirmed()).toHaveLength(0);

    memory.confirm(candidate.id);
    expect(memory.confirmed()).toHaveLength(1);
    expect(memory.confirmed()[0].source).toBe('explicit-user-request');
  });

  it('deduplicates the same sourced memory', async () => {
    const memory = new MemoryStore(memoryStorage());
    const first = await memory.propose('Alice mag klares Deutsch', 'conversation');
    const second = await memory.propose('  Alice  mag klares Deutsch ', 'conversation');

    expect(second.id).toBe(first.id);
    expect(memory.snapshot()).toHaveLength(1);
  });
});
