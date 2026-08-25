import { describe, expect, it } from 'vitest';
import { calculatePerspectiveFrame } from '../src/xr/framing.js';

describe('responsive avatar framing', () => {
  it('moves the camera back far enough to retain the full avatar on a phone portrait viewport', () => {
    const frame = calculatePerspectiveFrame({
      viewportWidth: 412,
      viewportHeight: 915,
      verticalFovDegrees: 42,
      boundsWidth: 1.45,
      boundsHeight: 3.1,
      boundsDepth: 0.9,
      padding: 1.2,
      minimumDistance: 3.35,
    });

    expect(frame.aspect).toBeCloseTo(412 / 915, 5);
    expect(frame.distance).toBeGreaterThan(5);
  });

  it('also respects horizontal fit on a very narrow viewport', () => {
    const frame = calculatePerspectiveFrame({
      viewportWidth: 280,
      viewportHeight: 1000,
      verticalFovDegrees: 42,
      boundsWidth: 1.8,
      boundsHeight: 2,
      padding: 1.2,
    });

    expect(frame.limitingAxis).toBe('horizontal');
  });
});
