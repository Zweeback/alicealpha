import { afterEach, describe, expect, it, vi } from 'vitest';
import { VoiceChannel } from '../src/core/voice.js';

const originalSynthesis = globalThis.speechSynthesis;
const originalUtterance = globalThis.SpeechSynthesisUtterance;

afterEach(() => {
  if (originalSynthesis === undefined) delete globalThis.speechSynthesis;
  else globalThis.speechSynthesis = originalSynthesis;
  if (originalUtterance === undefined) delete globalThis.SpeechSynthesisUtterance;
  else globalThis.SpeechSynthesisUtterance = originalUtterance;
});

describe('Alice audible speech lifecycle', () => {
  it('starts avatar cues on speech onset and ends mouth motion when speech ends', () => {
    const utterances = [];
    globalThis.SpeechSynthesisUtterance = class {
      constructor(text) { this.text = text; }
    };
    globalThis.speechSynthesis = {
      cancel: vi.fn(),
      speak: (utterance) => utterances.push(utterance),
      getVoices: () => [],
    };

    const energies = [];
    const starts = vi.fn();
    const boundaries = vi.fn();
    const ends = vi.fn();
    const voice = new VoiceChannel({ onSpeechEnergy: (value) => energies.push(value) });
    voice.speak({
      spoken_text: 'Hallo, hier ist Alice.',
      voice: { language: 'de-DE' },
    }, { onStart: starts, onBoundary: boundaries, onEnd: ends });

    expect(starts).not.toHaveBeenCalled();
    const utterance = utterances[0];
    utterance.onstart();
    utterance.onboundary({ charIndex: 0 });
    expect(starts).toHaveBeenCalledTimes(1);
    expect(boundaries).toHaveBeenCalledWith(0);
    expect(energies.some((level) => level > 0)).toBe(true);
    utterance.onend();
    expect(energies.at(-1)).toBe(0);
    expect(ends).toHaveBeenCalledTimes(1);
  });

  it('never signals audible output without an available speech synthesizer', () => {
    delete globalThis.speechSynthesis;
    delete globalThis.SpeechSynthesisUtterance;
    const starts = vi.fn();
    const ends = vi.fn();
    const voice = new VoiceChannel();
    voice.speak({ spoken_text: 'Test' }, { onStart: starts, onEnd: ends });
    expect(starts).not.toHaveBeenCalled();
    expect(ends).toHaveBeenCalledTimes(1);
  });

  it('ignores late browser events after speech is cancelled', () => {
    const utterances = [];
    globalThis.SpeechSynthesisUtterance = class {
      constructor(text) { this.text = text; }
    };
    globalThis.speechSynthesis = {
      cancel: vi.fn(),
      speak: (utterance) => utterances.push(utterance),
      getVoices: () => [],
    };
    const ends = vi.fn();
    const voice = new VoiceChannel();
    voice.speak({ spoken_text: 'Nicht mehr sprechen' }, { onEnd: ends });
    const old = utterances[0];
    voice.stopSpeaking();
    old.onend();
    expect(ends).not.toHaveBeenCalled();
  });
});
