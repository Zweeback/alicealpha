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
  it('persists continuity and a bounded local livechat history', () => {
    const backing = storage();
    const first = new CompanionStore(backing, () => '2026-09-25T00:00:00.000Z');
    expect(first.openSession()).toMatchObject({
      sessionCount: 1,
      turnCount: 0,
      previousSeenAt: null,
    });
    first.recordTurn();
    first.recordTurn();
    first.recordMessage('user', 'Hi Alice');
    first.recordMessage('alice', 'Hey. Ich bin da.', 'local');

    const second = new CompanionStore(backing, () => '2026-09-26T00:00:00.000Z');
    expect(second.openSession()).toMatchObject({
      sessionCount: 2,
      turnCount: 2,
      previousSeenAt: '2026-09-25T00:00:00.000Z',
    });
    expect(second.history()).toEqual([
      expect.objectContaining({ role: 'user', text: 'Hi Alice' }),
      expect.objectContaining({ role: 'alice', text: 'Hey. Ich bin da.', source: 'local' }),
    ]);
    expect(JSON.stringify(second.snapshot())).not.toContain('Hi Alice');
  });

  it('bounds history and can clear it without resetting continuity counters', () => {
    const backing = storage();
    const companion = new CompanionStore(backing, () => '2026-09-27T00:00:00.000Z');
    companion.openSession();
    for (let index = 0; index < 90; index += 1) companion.recordMessage('user', `m-${index}`);
    expect(companion.history(80)).toHaveLength(80);
    expect(companion.history(80)[0].text).toBe('m-10');
    companion.clearHistory();
    expect(companion.history()).toEqual([]);
    expect(companion.snapshot().sessionCount).toBe(1);
  });
});
