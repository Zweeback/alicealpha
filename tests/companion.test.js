import { describe, expect, it } from 'vitest';
import { CompanionStore } from '../src/core/companion.js';

function storage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
}

describe('CompanionStore', () => {
  it('persists continuity without storing conversation content', () => {
    const backing = storage();
    const first = new CompanionStore(backing, () => '2026-09-25T00:00:00.000Z');
    expect(first.openSession()).toMatchObject({
      sessionCount: 1,
      turnCount: 0,
      previousSeenAt: null,
    });
    first.recordTurn();
    first.recordTurn();

    const second = new CompanionStore(backing, () => '2026-09-26T00:00:00.000Z');
    expect(second.openSession()).toMatchObject({
      sessionCount: 2,
      turnCount: 2,
      previousSeenAt: '2026-09-25T00:00:00.000Z',
    });
    expect(JSON.stringify(second.snapshot())).not.toContain('conversation');
  });
});
