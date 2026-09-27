import { describe, expect, it } from 'vitest';
import { ALICE_VISUAL_DEMO, visualDemoEnabled } from '../src/xr/demoDirector.js';

describe('Alice visual demo', () => {
  it('is opt-in only', () => {
    expect(visualDemoEnabled('')).toBe(false);
    expect(visualDemoEnabled('?demo=1')).toBe(true);
  });

  it('contains bounded visual beats', () => {
    expect(ALICE_VISUAL_DEMO.length).toBeGreaterThanOrEqual(4);
    for (const beat of ALICE_VISUAL_DEMO) {
      expect(beat.duration_ms).toBeGreaterThanOrEqual(800);
      expect(beat.cue.intensity).toBeGreaterThanOrEqual(0);
      expect(beat.cue.intensity).toBeLessThanOrEqual(1);
    }
  });
});
