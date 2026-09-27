import { describe, test, expect, beforeEach } from 'vitest';
import { parseLlmChain, isCircuitOpen, tripCircuit, resetCircuits, getAvailableProviders, streamLlmChat } from '../server/llmRouter.js';

describe('llmRouter', () => {
  beforeEach(() => {
    resetCircuits();
  });

  test('parseLlmChain parses chain string correctly', () => {
    const chainStr = 'gemini:gemini-2.5-flash,groq:llama-3.3-70b-versatile,openrouter:google/gemini-2.5-flash:free';
    const parsed = parseLlmChain(chainStr);
    expect(parsed).toEqual([
      { provider: 'gemini', model: 'gemini-2.5-flash' },
      { provider: 'groq', model: 'llama-3.3-70b-versatile' },
      { provider: 'openrouter', model: 'google/gemini-2.5-flash:free' },
    ]);
  });

  test('circuit breaker opens and resets', () => {
    expect(isCircuitOpen('groq')).toBe(false);
    tripCircuit('groq');
    expect(isCircuitOpen('groq')).toBe(true);
    resetCircuits();
    expect(isCircuitOpen('groq')).toBe(false);
  });

  test('getAvailableProviders filters based on environment keys and circuit status', () => {
    const env = {
      ALICE_LLM_CHAIN: 'gemini:gemini-2.5-flash,groq:llama-3.3-70b-versatile',
      GEMINI_API_KEY: 'test-gemini-key',
    };

    let available = getAvailableProviders(env);
    expect(available).toEqual([{ provider: 'gemini', model: 'gemini-2.5-flash' }]);

    tripCircuit('gemini');
    available = getAvailableProviders(env);
    expect(available).toEqual([]);
  });

  test('streamLlmChat falls back on 429 error and trips circuit breaker', async () => {
    const env = {
      ALICE_LLM_CHAIN: 'groq:llama-3.3-70b-versatile,gemini:gemini-2.5-flash',
      GROQ_API_KEY: 'groq-key',
      GEMINI_API_KEY: 'gemini-key',
    };

    const mockFetch = async (url) => {
      if (url.includes('groq')) {
        return { ok: false, status: 429 };
      }
      if (url.includes('googleapis')) {
        const encoder = new TextEncoder();
        const stream = new ReadableStream({
          start(controller) {
            controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"Hallo!"}}]}\n\n'));
            controller.enqueue(encoder.encode('data: [DONE]\n\n'));
            controller.close();
          },
        });
        return { ok: true, status: 200, body: stream };
      }
      return { ok: false, status: 404 };
    };

    const chunks = [];
    const result = await streamLlmChat(
      { text: 'Hallo' },
      (chunk) => chunks.push(chunk),
      { env, fetchFn: mockFetch }
    );

    expect(result.provider).toBe('gemini');
    expect(isCircuitOpen('groq')).toBe(true);
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks.some((c) => c.delta?.content === 'Hallo!')).toBe(true);
  });
});
