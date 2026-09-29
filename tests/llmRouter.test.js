import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildChatSystemPrompt,
  completeLlmChat,
  getAvailableProviders,
  isCircuitOpen,
  parseLlmChain,
  resetCircuits,
} from '../server/llmRouter.js';

describe('Alice LLM router', () => {
  beforeEach(() => resetCircuits());

  it('parses provider chains without losing model suffixes', () => {
    expect(parseLlmChain('gemini:gemini-2.5-flash,openrouter:google/gemini-2.5-flash:free')).toEqual([
      { provider: 'gemini', model: 'gemini-2.5-flash' },
      { provider: 'openrouter', model: 'google/gemini-2.5-flash:free' },
    ]);
  });

  it('reports only configured providers and never returns key material', () => {
    const env = {
      ALICE_LLM_CHAIN: 'gemini:gemini-2.5-flash,groq:llama-3.3-70b-versatile',
      GEMINI_API_KEY: 'secret-gemini-key',
    };
    const available = getAvailableProviders(env);
    expect(available).toEqual([{ provider: 'gemini', model: 'gemini-2.5-flash' }]);
    expect(JSON.stringify(available)).not.toContain('secret-gemini-key');
  });

  it('keeps confirmed memory bounded and marks the gateway as tool-free', () => {
    const prompt = buildChatSystemPrompt({
      confirmed_memory: [{ value: 'Alice memory' }],
      companion_state: { sessionCount: 3, turnCount: 12 },
    });
    expect(prompt).toContain('Alice memory');
    expect(prompt).toContain('keine Modell-Tools');
    expect(prompt).toContain('Sitzung 3');
  });

  it('falls through on 429 and returns the next provider with provenance', async () => {
    const env = {
      ALICE_LLM_CHAIN: 'groq:llama-3.3-70b-versatile,gemini:gemini-2.5-flash',
      GROQ_API_KEY: 'groq-key',
      GEMINI_API_KEY: 'gemini-key',
      ALICE_LLM_TIMEOUT_MS: '500',
    };
    const fetchFn = vi.fn(async (url) => {
      if (String(url).includes('groq')) return { ok: false, status: 429, json: async () => ({}) };
      return {
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: { content: 'Bonjour. Ich bin da.' } }] }),
      };
    });

    const result = await completeLlmChat({ text: 'Hallo Alice' }, { env, fetchFn });
    expect(result).toMatchObject({
      reply: 'Bonjour. Ich bin da.',
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      source: 'llm-router:gemini',
    });
    expect(isCircuitOpen('groq', 'llama-3.3-70b-versatile')).toBe(true);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('fails closed when no provider is configured', async () => {
    await expect(completeLlmChat(
      { text: 'Hallo' },
      { env: { ALICE_LLM_CHAIN: 'groq:llama-3.3-70b-versatile' }, fetchFn: vi.fn() },
    )).rejects.toThrow('llm-router-no-provider');
  });
});
