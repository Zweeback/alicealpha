import { describe, expect, it } from 'vitest';
import { AliceRuntime, ARKIT_52, EMOTIONS } from '../src/xr/aliceRuntime.js';

function fakeVrm() {
  const values = new Map();
  const bones = new Map();
  const node = () => ({
    rotation: { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; } },
    position: { x: 0, y: 0, z: 0, constructor: class { set() { return this; } sub() { return this; } } },
    getWorldPosition() {},
  });
  return {
    values,
    expressionManager: { setValue: (name, value) => values.set(name, value) },
    humanoid: {
      getNormalizedBoneNode: (name) => {
        if (!bones.has(name)) bones.set(name, node());
        return bones.get(name);
      },
    },
    scene: { worldToLocal() {} },
  };
}

describe('AliceRuntime', () => {
  it('exposes the ARKit-52 set and the five VRM emotions', () => {
    expect(ARKIT_52).toHaveLength(52);
    expect(new Set(ARKIT_52).size).toBe(52);
    expect(EMOTIONS).toEqual(['happy', 'sad', 'angry', 'surprised', 'relaxed']);
  });

  it('strips emotion tags from LLM text and applies the last one', () => {
    const rt = new AliceRuntime(fakeVrm());
    expect(rt.say('[happy] Hallo [sad] Welt')).toBe('Hallo Welt');
    expect(rt.emoTarget.sad).toBeGreaterThan(0);
    expect(rt.emoTarget.happy).toBe(0);
  });

  it('clamps viseme input to 0..1 and writes it to the expression manager', () => {
    const vrm = fakeVrm();
    const rt = new AliceRuntime(vrm, { blink: false, gaze: false, pose: false });
    rt.setVisemes({ aa: 4, ih: -2, ou: 0.5 });
    rt.update(0.016);
    expect(vrm.values.get('aa')).toBe(1);
    expect(vrm.values.get('ih')).toBe(0);
    expect(vrm.values.get('ou')).toBeCloseTo(0.5, 5);
  });

  it('never lets mouthClose exceed jawOpen (no lip crossing)', () => {
    const vrm = fakeVrm();
    const rt = new AliceRuntime(vrm, { blink: false, gaze: false, pose: false });
    rt.setArkit({ jawOpen: 0.1, mouthClose: 0.9 });
    for (let i = 0; i < 60; i++) rt.update(0.016);
    expect(rt.out.mouthClose).toBeLessThanOrEqual(rt.out.jawOpen + 1e-9);
  });

  it('relaxes ARKit channels once the external input expires', () => {
    const vrm = fakeVrm();
    const rt = new AliceRuntime(vrm, { blink: false, gaze: false, pose: false });
    rt.setArkit({ jawOpen: 1 });
    for (let i = 0; i < 20; i++) rt.update(0.016);
    expect(rt.arkitActive).toBe(true);
    for (let i = 0; i < 200; i++) rt.update(0.016);
    expect(rt.arkitActive).toBe(false);
    expect(rt.out.jawOpen).toBeLessThan(0.05);
  });

  it('keeps eye blink and look channels binary (texture-swap eyes)', () => {
    const vrm = fakeVrm();
    const rt = new AliceRuntime(vrm, { blink: false, gaze: false, pose: false });
    rt.setArkit({ eyeBlinkLeft: 0.7, eyeLookUpLeft: 0.4 });
    rt.update(0.016);
    expect(rt.out.eyeBlinkLeft).toBe(1);
    expect(rt.out.eyeLookUpLeft).toBe(1);
  });

  it('issues blinks on its own when no ARKit blink is supplied', () => {
    const vrm = fakeVrm();
    const rt = new AliceRuntime(vrm, { gaze: false, pose: false });
    let sawBlink = false;
    for (let i = 0; i < 60 * 12 && !sawBlink; i++) {
      rt.update(0.016);
      if (rt.out.blink === 1) sawBlink = true;
    }
    expect(sawBlink).toBe(true);
  });
});
