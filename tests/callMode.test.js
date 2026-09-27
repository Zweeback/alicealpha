import { describe, expect, it } from 'vitest';
import { callModeEnabled } from '../src/core/callMode.js';

describe('Alice call mode', () => {
  it('is opt-in through a stable query contract', () => {
    expect(callModeEnabled('')).toBe(false);
    expect(callModeEnabled('?call=1')).toBe(true);
    expect(callModeEnabled('?mode=call')).toBe(true);
    expect(callModeEnabled('?call=0')).toBe(false);
  });
});
