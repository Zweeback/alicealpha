import { describe, expect, it } from 'vitest';
import { ALICE_REALTIME_INSTRUCTIONS, ALICE_TOOLS } from '../server/alicePrompt.js';

describe('Alice realtime prompt contract', () => {
  it('exposes embodiment and tribunal tools as separate capabilities', () => {
    expect(ALICE_TOOLS.map((tool) => tool.name)).toEqual([
      'get_companion_state',
      'drive_avatar',
      'propose_memory',
      'resolve_memory',
    ]);
  });

  it('keeps relationship and camera epistemic boundaries explicit', () => {
    expect(ALICE_REALTIME_INSTRUCTIONS).toMatch(/keine Schuld, Eifersucht oder Exklusivität/i);
    expect(ALICE_REALTIME_INSTRUCTIONS).toMatch(/unsichere Beobachtung, keine Diagnose/i);
    expect(ALICE_REALTIME_INSTRUCTIONS).toMatch(/nie vorwurfsvoll oder besitzergreifend/i);
  });
});
