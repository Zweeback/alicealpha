import { describe, expect, it } from 'vitest';
import { buildRealtimeSession } from '../server/realtimeSession.js';

describe('Realtime session config', () => {
  it('uses the current transcription contract', () => {
    const session = buildRealtimeSession({});
    expect(session.type).toBe('realtime');
    expect(session.model).toBe('gpt-realtime-2.1');
    expect(session.audio.input.transcription).toEqual({
      model: 'gpt-4o-mini-transcribe',
      language: 'de',
    });
    expect(session.audio.input.transcription.languages).toBeUndefined();
  });

  it('keeps model and voice configurable without changing the contract shape', () => {
    const session = buildRealtimeSession({
      OPENAI_REALTIME_MODEL: 'gpt-realtime-2.1',
      OPENAI_REALTIME_VOICE: 'marin',
      OPENAI_TRANSCRIPTION_MODEL: 'gpt-4o-transcribe',
    });
    expect(session.model).toBe('gpt-realtime-2.1');
    expect(session.audio.output.voice).toBe('marin');
    expect(session.audio.input.transcription.model).toBe('gpt-4o-transcribe');
    expect(session.audio.input.transcription.language).toBe('de');
  });
});
