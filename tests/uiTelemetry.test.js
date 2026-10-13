import { describe, expect, it } from 'vitest';
import { createUiTelemetry, safeResourceLabel, sampleDom } from '../src/telemetry/uiTelemetry.js';

describe('Alice UI/UX live telemetry privacy and scope', () => {
  const origin = 'https://alicealpha.onrender.com';

  it('never exports URL query parameters or fragments', () => {
    expect(safeResourceLabel(origin + '/api/chat?key=SECRET&email=user%40example.com#secret', origin))
      .toBe('/api/chat');
  });

  it('hides cross-origin paths, queries and tokens', () => {
    expect(safeResourceLabel('https://other.example/users/token-value?secret=yes', origin))
      .toBe('https://other.example/[cross-origin path omitted]');
  });

  it('redacts all non-allowlisted path identifiers, including short secrets', () => {
    expect(safeResourceLabel(origin + '/files/1NWsx8t3l7H6uZ0crqaPbhUl3zMSl7VRf/view', origin))
      .toBe('/:segment/:segment/:segment');
  });

  it('never emits an arbitrary short secret in a same-origin path', () => {
    expect(safeResourceLabel(origin + '/secret/abc123?auth=TOPSECRET', origin))
      .toBe('/:segment/:segment');
  });

  it('does not invent browser telemetry in a non-browser test environment', () => {
    const engine = createUiTelemetry();
    expect(engine.start()).toBe(false);
    expect(engine.getSnapshot().running).toBe(false);
    expect(engine.getSnapshot().events).toEqual([]);
    expect(sampleDom()).toEqual({ inspected: 0, hidden: 0, frames: 0, truncated: false });
    expect(JSON.parse(engine.exportJson()).schema).toBe('alice.uiux.telemetry.v1');
  });
});
