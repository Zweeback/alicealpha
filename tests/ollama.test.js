import { describe, expect, it } from 'vitest';
import { buildOllamaPrompt } from '../server/ollama.js';

describe('local Ollama prompt', () => {
  it('includes user text and confirmed memory only', () => {
    const prompt = buildOllamaPrompt({
      text: 'Hallo Alice',
      confirmed_memory: [
        { value: 'bestätigt', status: 'confirmed' },
        { value: 'nicht bestätigt', status: 'candidate' },
      ],
      persona_state: { mood: 'calm' },
    });

    expect(prompt).toContain('Hallo Alice');
    expect(prompt).toContain('bestätigt');
    expect(prompt).not.toContain('nicht bestätigt');
    expect(prompt).toContain('"mood":"calm"');
  });
});
