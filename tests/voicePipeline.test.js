import { describe, test, expect, beforeEach } from 'vitest';
import { AliceTts } from '../src/core/tts.js';
import { VoicePipeline } from '../src/core/voicePipeline.js';

describe('AliceTts', () => {
  test('splits German text into sentences correctly', () => {
    const tts = new AliceTts();
    const text = 'Hallo Alice! Wie geht es dir? Ich hoffe gut.';
    const sentences = tts.splitIntoSentences(text);
    expect(sentences).toEqual([
      'Hallo Alice!',
      'Wie geht es dir?',
      'Ich hoffe gut.',
    ]);
  });
});

describe('VoicePipeline', () => {
  let pipeline;
  let stateLog;

  beforeEach(() => {
    stateLog = [];
    pipeline = new VoicePipeline({
      onState: (state) => stateLog.push(state),
    });
  });

  test('barge-in interrupts active speaking state and switches to listening', () => {
    pipeline.setState('speaking');
    expect(pipeline.state).toBe('speaking');

    pipeline.handleBargeIn();
    expect(pipeline.state).toBe('listening');
    expect(stateLog).toContain('listening');
  });
});
