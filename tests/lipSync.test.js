import { describe, expect, it } from 'vitest';
import {
  buildVisemeWeights,
  classifyVisemeTarget,
  collectMorphVisemeChannels,
  normalizeMorphName,
} from '../src/xr/lipSync.js';

describe('Alice lip sync', () => {
  it('normalizes common morph target names', () => {
    expect(normalizeMorphName('Viseme_AA')).toBe('visemeaa');
    expect(classifyVisemeTarget('jaw_Open')).toBe('A');
    expect(classifyVisemeTarget('mouth_OH')).toBe('O');
    expect(classifyVisemeTarget('Smile')).toBeNull();
  });

  it('returns silence when Alice is not speaking', () => {
    expect(buildVisemeWeights({ timeSeconds: 1, energy: 0.9, speaking: false }))
      .toEqual({ A: 0, I: 0, U: 0, E: 0, O: 0 });
  });

  it('keeps audio-reactive viseme weights bounded', () => {
    const weights = buildVisemeWeights({ timeSeconds: 0.17, energy: 0.8, speaking: true });
    const values = Object.values(weights);
    expect(values.some((value) => value > 0)).toBe(true);
    expect(Math.max(...values)).toBeLessThanOrEqual(0.8);
    expect(values.every((value) => value >= 0 && value <= 1)).toBe(true);
  });

  it('discovers compatible GLB morph targets without touching unrelated expressions', () => {
    const mesh = {
      morphTargetDictionary: { Viseme_AA: 0, mouth_OH: 1, Smile: 2 },
      morphTargetInfluences: [0, 0, 0],
    };
    const root = { traverse(callback) { callback(mesh); } };
    const channels = collectMorphVisemeChannels(root);
    expect(channels.map(({ viseme, index }) => ({ viseme, index }))).toEqual([
      { viseme: 'A', index: 0 },
      { viseme: 'O', index: 1 },
    ]);
  });
});
