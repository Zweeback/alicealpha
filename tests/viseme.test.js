import { describe, expect, it } from 'vitest';
import { VRM_VISEME_EXPRESSIONS, visemeForTextBoundary } from '../src/core/viseme.js';

describe('local speech visemes', () => {
  it('maps German vowels and umlauts to the five VRM mouth presets', () => {
    expect(visemeForTextBoundary('Hallo', 0)).toBe('A');
    expect(visemeForTextBoundary('Liebe', 0)).toBe('I');
    expect(visemeForTextBoundary('Uhr', 0)).toBe('U');
    expect(visemeForTextBoundary('Echt', 0)).toBe('E');
    expect(visemeForTextBoundary('Öl', 0)).toBe('O');
  });

  it('uses the current speech boundary and returns null without a vowel', () => {
    expect(visemeForTextBoundary('Hallo Welt', 6)).toBe('E');
    expect(visemeForTextBoundary('psst', 0)).toBeNull();
    expect(visemeForTextBoundary('', 0)).toBeNull();
  });

  it('targets the standard VRM vowel expression names', () => {
    expect(VRM_VISEME_EXPRESSIONS).toEqual({
      A: 'aa',
      I: 'ih',
      U: 'ou',
      E: 'ee',
      O: 'oh',
    });
  });
});
