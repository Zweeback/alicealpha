import { describe, expect, it } from 'vitest';
import { BROWSER_MODEL_ID, WEBLLM_MODULE_URL, browserAIAvailable } from '../src/core/browserModel.js';

describe('browser-local AI fallback', () => {
  it('uses the small Qwen browser model and a remote module loaded only on demand', () => {
    expect(BROWSER_MODEL_ID).toBe('Qwen2.5-0.5B-Instruct-q4f16_1-MLC');
    expect(WEBLLM_MODULE_URL).toBe('https://esm.run/@mlc-ai/web-llm');
  });

  it('requires WebGPU without touching the real browser environment', () => {
    expect(browserAIAvailable({ navigator: { gpu: {} } })).toBe(true);
    expect(browserAIAvailable({ navigator: {} })).toBe(false);
    expect(browserAIAvailable({})).toBe(false);
  });
});
