import { describe, expect, it } from 'vitest';
import { getModelMetrics } from './modelMetrics.js';

describe('Alice Studio model audit', () => {
  it('keeps measurements empty when no model was loaded', () => {
    expect(getModelMetrics(null)).toEqual({
      type: 'unknown', meshes: 0, bones: 0, triangles: 0,
      morphTargets: 0, expressions: 0, vrm: false,
    });
  });
  it('counts indexed and non-indexed mesh triangles without inventing rig stats', () => {
    const nodes = [
      { isMesh: true, geometry: { index: { count: 18 } }, morphTargetDictionary: { blink: 0 } },
      { isMesh: true, geometry: { attributes: { position: { count: 9 } } }, morphTargetDictionary: { blink: 0, happy: 1 } },
      { isBone: true },
    ];
    const model = { traverse: (fn) => nodes.forEach(fn) };
    expect(getModelMetrics(model, null, 'glb')).toEqual({
      type: 'glb', meshes: 2, bones: 1, triangles: 9,
      morphTargets: 2, expressions: 2, vrm: false,
    });
  });
  it('distinguishes a VRM parser result from a generic glTF scene', () => {
    const model = { traverse: () => undefined };
    const stats = getModelMetrics(model, { expressionManager: { expressions: [{}, {}] } }, 'vrm');
    expect(stats.vrm).toBe(true);
    expect(stats.expressions).toBe(2);
  });
});
