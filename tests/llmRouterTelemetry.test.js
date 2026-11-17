import { beforeEach, describe, expect, it, vi } from 'vitest';
import { completeLlmChat, resetCircuits } from '../server/llmRouter.js';

describe('Alice provider attempt telemetry', () => {
  beforeEach(() => resetCircuits());

  it('records failed fallback and successful provider with safe usage but no chat content', async () => {
    const onAttempt = vi.fn();
    const fetchFn = vi.fn(async (url) => {
      if (String(url).includes('groq')) return { ok: false, status: 429 };
      return { ok: true, json: async () => ({
        choices: [{ message: { content: 'PRIVATE ANSWER' } }],
        usage: { prompt_tokens: 19, completion_tokens: 6, total_tokens: 25 },
      }) };
    });
    const result = await completeLlmChat(
      { text: 'PRIVATE PROMPT' },
      {
        env: {
          ALICE_LLM_CHAIN: 'groq:llama-3.3-70b-versatile,gemini:gemini-2.5-flash',
          GROQ_API_KEY: 'private-groq-key',
          GEMINI_API_KEY: 'private-gemini-key',
        },
        fetchFn,
        onAttempt,
      },
    );
    expect(result).toMatchObject({ reply: 'PRIVATE ANSWER', provider: 'gemini' });
    expect(onAttempt).toHaveBeenCalledTimes(2);
    const failed = onAttempt.mock.calls[0][0];
    const success = onAttempt.mock.calls[1][0];
    expect(failed).toMatchObject({ provider: 'groq', outcome: 'error', errorType: 'http_429' });
    expect(success).toMatchObject({
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      outcome: 'success',
      usage: { input_tokens: 19, output_tokens: 6, total_tokens: 25 },
    });
    expect(Date.parse(success.completedAt)).toBeGreaterThanOrEqual(Date.parse(success.startedAt));
    expect(JSON.stringify(onAttempt.mock.calls)).not.toMatch(/PRIVATE|key|message/);
  });

  it('does not let a failing telemetry callback block a model response', async () => {
    const result = await completeLlmChat(
      { text: 'Hallo' },
      {
        env: { ALICE_LLM_CHAIN: 'gemini:gemini-2.5-flash', GEMINI_API_KEY: 'dummy' },
        fetchFn: async () => ({ ok: true, json: async () => ({
          choices: [{ message: { content: 'Antwort' } }],
        }) }),
        onAttempt: () => { throw new Error('telemetry-offline'); },
      },
    );
    expect(result.reply).toBe('Antwort');
  });
});
