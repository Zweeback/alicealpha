import { describe, expect, it } from 'vitest';
import { safeJson } from '../src/core/realtime.js';

describe('Realtime event boundary', () => {
  it('parses valid model tool arguments', () => {
    expect(safeJson('{"gesture":"welcome","intensity":0.5}')).toEqual({ gesture: 'welcome', intensity: 0.5 });
  });

  it('turns malformed model arguments into a safe empty object', () => {
    expect(safeJson('{not-json')).toEqual({});
  });
});
