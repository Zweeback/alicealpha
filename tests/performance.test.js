import { describe, expect, it } from 'vitest';
import { createPerformancePlan, validatePerformancePlan } from '../src/core/performance.js';

describe('performance plans', () => {
  it('turns conversational intent into a timed embodied cue sequence', () => {
    const plan = createPerformancePlan('Ich bin bei dir.', { warmth: 0.8 }, 'support');

    expect(validatePerformancePlan(plan)).toBe(true);
    expect(plan.timeline[0]).toMatchObject({ type: 'gesture', name: 'hand_to_core' });
    expect(plan.duration_ms).toBeGreaterThanOrEqual(900);
    expect(plan.safety.motion_profile).toBe('close_proximity');
  });

  it('rejects malformed external plans', () => {
    expect(validatePerformancePlan({ schema_version: '1.0.0', timeline: [{ t_ms: -1, type: 'gesture' }] })).toBe(false);
  });
});
