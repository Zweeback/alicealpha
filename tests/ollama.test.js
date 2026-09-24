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
      companion_state: { sessionCount: 4, turnCount: 12 },
    });

    expect(prompt).toContain('Hallo Alice');
    expect(prompt).toContain('bestätigt');
    expect(prompt).not.toContain('nicht bestätigt');
    expect(prompt).toContain('"mood":"calm"');
    expect(prompt).toContain('Sitzung 4');
    expect(prompt).toContain('bisherige Turns 12');
  });
});
