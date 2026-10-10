import { describe, expect, it } from 'vitest';
import { TurnCoordinator } from '../src/core/turnCoordinator.js';

describe('Alice turn coordinator', () => {
  it('invalidates an old response when a newer turn begins', () => {
    const turns = new TurnCoordinator();
    const first = turns.begin();
    expect(first.isCurrent()).toBe(true);
    const second = turns.begin();
    expect(first.signal.aborted).toBe(true);
    expect(first.isCurrent()).toBe(false);
    expect(second.isCurrent()).toBe(true);
  });

  it('cancels pending work and prevents its delayed callbacks', () => {
    const turns = new TurnCoordinator();
    const current = turns.begin();
    turns.cancel();
    expect(current.signal.aborted).toBe(true);
    expect(current.isCurrent()).toBe(false);
  });

  it('does not let a completed old turn invalidate the new turn', () => {
    const turns = new TurnCoordinator();
    const first = turns.begin();
    first.finish();
    const second = turns.begin();
    first.finish();
    expect(second.isCurrent()).toBe(true);
    second.finish();
    expect(second.isCurrent()).toBe(true);
  });
});
