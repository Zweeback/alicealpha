import { describe, expect, it, vi } from 'vitest';
import { RealtimeChannel, safeJson } from '../src/core/realtime.js';

describe('Realtime event boundary', () => {
  it('parses valid model tool arguments', () => {
    expect(safeJson('{"gesture":"welcome","intensity":0.5}')).toEqual({ gesture: 'welcome', intensity: 0.5 });
  });

  it('turns malformed model arguments into a safe empty object', () => {
    expect(safeJson('{not-json')).toEqual({});
  });

  it('does not claim avatar success before both playback and render boundary are observed', () => {
    vi.useFakeTimers();
    const onTrace = vi.fn();
    const channel = new RealtimeChannel({ onTrace });
    channel.receivedAudio = true;
    channel.turnTrace.begin({
      stages: [
        { stage: 'mic', status: 'ok' },
        { stage: 'vad', status: 'ok' },
        { stage: 'stt', status: 'ok' },
        { stage: 'agent', status: 'ok' },
        { stage: 'tts', status: 'ok' },
        { stage: 'playback', status: 'pending' },
        { stage: 'avatar', status: 'pending' },
      ],
    });

    expect(channel.completeResponse()).toBe(false);
    expect(onTrace).not.toHaveBeenCalled();

    channel.turnTrace.mark('playback', 'ok', {
      detail: { source: 'remote-audio-analyser' },
    });
    expect(onTrace).not.toHaveBeenCalled();

    expect(channel.markAvatarSignal({
      source: 'AliceWorld.setSpeechEnergy',
    })).toBe(true);
    expect(onTrace).toHaveBeenCalledTimes(1);
    const trace = onTrace.mock.calls[0][0];
    expect(trace.stages.find((stage) => stage.stage === 'playback').status).toBe('ok');
    expect(trace.stages.find((stage) => stage.stage === 'avatar')).toMatchObject({
      status: 'ok',
      detail: { source: 'AliceWorld.setSpeechEnergy' },
    });
    vi.useRealTimers();
  });

  it('fails closed after the bounded audio observation grace period', () => {
    vi.useFakeTimers();
    const onTrace = vi.fn();
    const channel = new RealtimeChannel({ onTrace });
    channel.receivedAudio = true;
    channel.turnTrace.begin({
      stages: [
        { stage: 'agent', status: 'ok' },
        { stage: 'tts', status: 'ok' },
        { stage: 'playback', status: 'pending' },
        { stage: 'avatar', status: 'pending' },
      ],
    });

    channel.completeResponse();
    vi.advanceTimersByTime(1800);

    expect(onTrace).toHaveBeenCalledTimes(1);
    const trace = onTrace.mock.calls[0][0];
    expect(trace.stages.find((stage) => stage.stage === 'playback').status).toBe('timeout');
    expect(trace.stages.find((stage) => stage.stage === 'avatar').status).toBe('timeout');
    vi.useRealTimers();
  });
});
