import { describe, expect, it } from 'vitest';
import { ALICE_REALTIME_INSTRUCTIONS, buildAliceRoleInstructions } from '../server/alicePrompt.js';
import { buildRealtimeSession } from '../server/realtimeSession.js';
import { buildChatSystemPrompt } from '../server/llmRouter.js';

describe('Alice Wunderkammer opt-in role', () => {
  it('preserves the existing Alice contract by default and for unknown modes', () => {
    expect(buildAliceRoleInstructions({})).toBe(ALICE_REALTIME_INSTRUCTIONS);
    expect(buildAliceRoleInstructions({ ALICE_ROLE_MODE: 'unknown' })).toBe(ALICE_REALTIME_INSTRUCTIONS);
  });

  it('adds the work-oriented role without replacing safety, memory or avatar boundaries', () => {
    const instructions = buildAliceRoleInstructions({ ALICE_ROLE_MODE: 'wunderkammer' });
    expect(instructions).toMatch(/PROJEKT WUNDERKAMMER/);
    expect(instructions).toMatch(/Pixel 9a/);
    expect(instructions).toMatch(/kein Erfolg ohne überprüfbaren Nachweis/i);
    expect(instructions).toContain('get_companion_state');
    expect(instructions).toMatch(/keine Schuld, Eifersucht oder Exklusivität/i);
  });

  it('uses the identical opt-in role in Realtime and text chat', () => {
    const env = { ALICE_ROLE_MODE: 'wunderkammer' };
    const realtime = buildRealtimeSession(env).instructions;
    const chat = buildChatSystemPrompt({}, env);
    expect(realtime).toBe(buildAliceRoleInstructions(env));
    expect(chat.startsWith(realtime)).toBe(true);
    expect(chat).toMatch(/TEXT-\/VOICE-GATEWAY/);
  });
});
