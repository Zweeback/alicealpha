import { afterEach, describe, expect, it, vi } from 'vitest';
import { VoiceChannel } from '../src/core/voice.js';

describe('GLaDOS mode audio provenance', () => {
  const initial = {
    fetch: globalThis.fetch,
    Audio: globalThis.Audio,
    speechSynthesis: globalThis.speechSynthesis,
  };
  afterEach(() => {
    globalThis.fetch = initial.fetch;
    globalThis.Audio = initial.Audio;
    globalThis.speechSynthesis = initial.speechSynthesis;
  });

  it('reports unavailable model rather than substituting a browser voice', async () => {
    globalThis.Audio = class {};
    globalThis.fetch = vi.fn(async () => ({ ok: false, status: 503 }));
    const browserSpeak = vi.fn();
    globalThis.speechSynthesis = { cancel: vi.fn(), speak: browserSpeak };
    const onError = vi.fn();
    const onEnd = vi.fn();
    const voice = new VoiceChannel();
    voice.setMode('glados');
    voice.speak({ spoken_text: 'Hello, test subject.' }, { onError, onEnd });
    await vi.waitFor(() => expect(onError).toHaveBeenCalledOnce());
    expect(onEnd).toHaveBeenCalledOnce();
    expect(browserSpeak).not.toHaveBeenCalled();
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/glados-tts', expect.objectContaining({
      method: 'POST',
    }));
  });
});
