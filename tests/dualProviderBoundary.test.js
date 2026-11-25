import { beforeEach, describe, expect, it, vi } from 'vitest';
import { completeLlmChat, resetCircuits } from '../server/llmRouter.js';
import { runDualTurn } from '../server/dualAgents.js';

describe('Sami/Elisa provider boundary', () => {
  beforeEach(() => resetCircuits());

  it('sends two distinct system prompts through two actual router calls', async () => {
    const inputs = [];
    const fetchFn = vi.fn(async (_url, request) => {
      const input = JSON.parse(request.body);
      inputs.push(input);
      const role = input.messages[0]?.content?.includes('SAMI') ? 'Sami'
        : input.messages[0]?.content?.includes('ELISA') ? 'Elisa' : 'Alice';
      return {
        ok: true, status: 200,
        json: async () => ({ choices: [{ message: { content: role + ': eigener Befund' } }] }),
      };
    });
    const complete = (input, options) => completeLlmChat(input, {
      ...options,
      env: { ALICE_LLM_CHAIN: 'gemini:gemini-2.5-flash', GEMINI_API_KEY: 'fake-test-only' },
      fetchFn,
    });
    const result = await runDualTurn({ text: 'Finde den Fehler', complete, synthesize: false });
    expect(result.status).toBe('ok');
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(inputs.map((input) => input.messages[0].role)).toEqual(['system','system']);
    expect(inputs[0].messages[0].content).toContain('SAMI');
    expect(inputs[1].messages[0].content).toContain('ELISA');
    expect(inputs[0].messages[0].content).not.toContain('ELISA');
    expect(inputs[1].messages[0].content).not.toContain('SAMI');
    expect(inputs[0].messages[1].content).toBe('Finde den Fehler');
    expect(inputs[1].messages[1].content).toBe('Finde den Fehler');
    expect(result.agents.map((item) => item.reply)).toEqual([
      'Sami: eigener Befund',
      'Elisa: eigener Befund',
    ]);
    expect(JSON.stringify(result)).not.toContain('fake-test-only');
  });

  it('keeps the original single-Alice chat instructions when no override is supplied', async () => {
    let observed;
    await completeLlmChat({ text: 'Hallo' }, {
      env: { ALICE_LLM_CHAIN: 'gemini:gemini-2.5-flash', GEMINI_API_KEY: 'test-only' },
      fetchFn: async (_url, request) => {
        observed = JSON.parse(request.body);
        return { ok:true, json:async()=>({choices:[{message:{content:'Hallo zurück.'}}]}) };
      },
    });
    expect(observed.messages[0].content).toContain('Du bist Alice');
    expect(observed.messages[0].content).toContain('TEXT-/VOICE-GATEWAY');
  });
});
