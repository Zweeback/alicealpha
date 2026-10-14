import { describe, it, expect } from 'vitest';
import { resolveMorphWeight, auditMorphNames } from '../src/xr/rigExpressions.js';

describe('Alice facial expression rig mapping', () => {
  it('drives imported ARKit blendshape names instead of only generic names', () => {
    const controls = { jaw: 0.7, vowelA: 0.5, vowelI: 0.2, vowelU: 0.1, blink: 0.9, smile: 0.6, browRaise: 0.4 };
    expect(resolveMorphWeight('jawOpen', controls)).toBe(0.7);
    expect(resolveMorphWeight('viseme_aa', controls)).toBe(0.5);
    expect(resolveMorphWeight('eyeBlinkLeft', controls)).toBe(0.9);
    expect(resolveMorphWeight('mouthSmileRight', controls)).toBe(0.6);
    expect(resolveMorphWeight('browOuterUpLeft', controls)).toBe(0.4);
    expect(resolveMorphWeight('missingCharacterShape', controls)).toBeUndefined();
  });
  it('normalizes names safely and clamps invalid weights', () => {
    expect(resolveMorphWeight('eye_blink_right', { blink: 2 })).toBe(1);
    expect(resolveMorphWeight('brow-inner-up', { browRaise: -1 })).toBe(0);
    expect(resolveMorphWeight('jawopen', { jaw: Number.NaN })).toBe(0);
  });
  it('reports absent controls rather than falsely approving an avatar', () => {
    const report = auditMorphNames(['eyeBlinkLeft', 'jawOpen', 'mouthSmileLeft']);
    expect(report.coverage.blink).toBe(true);
    expect(report.coverage.smile).toBe(true);
    expect(report.missing).toContain('vowelU');
    expect(report.missing).toContain('browRaise');
  });
});
