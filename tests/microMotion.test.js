import { describe, expect, it } from 'vitest';
import { sampleMicroMotion } from '../src/xr/microMotion.js';

describe('avatar micro motion', () => {
  it('keeps signals bounded while avoiding a static stare', () => {
    const samples = Array.from({ length: 80 }, (_, index) => sampleMicroMotion(index * 0.25));

    expect(samples.every((sample) => sample.blinkOpen >= 0 && sample.blinkOpen <= 1)).toBe(true);
    expect(Math.max(...samples.map((sample) => Math.abs(sample.eyeYaw)))).toBeLessThanOrEqual(0.0341);
    expect(new Set(samples.map((sample) => sample.eyeYaw.toFixed(4))).size).toBeGreaterThan(5);
    expect(samples.some((sample) => sample.blinkOpen < 0.9)).toBe(true);
  });

  it('reduces gaze wandering while Alice is speaking', () => {
    const quiet = sampleMicroMotion(9.7, { speaking: false });
    const speaking = sampleMicroMotion(9.7, { speaking: true });

    expect(Math.abs(speaking.eyeYaw)).toBeLessThanOrEqual(0.0221);
    expect(Math.abs(quiet.eyeYaw)).toBeLessThanOrEqual(0.0341);
  });
});
