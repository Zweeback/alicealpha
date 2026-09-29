import { describe, expect, it, vi } from 'vitest';
import { BrowserTurnTrace, reportTurnTrace } from '../src/core/turnTrace.js';

describe('browser realtime turn traces', () => {
  it('records observed browser stages in canonical pipeline order', () => {
    let clock = 1000;
    const trace = new BrowserTurnTrace({ now: () => clock, id: () => 'turn-browser-1' });
    trace.begin();
    trace.mark('mic', 'ok', { latency_ms: 12 });
    clock += 20;
    trace.mark('vad', 'ok');
    trace.mark('stt', 'ok');
    trace.mark('agent', 'ok');
    trace.mark('tts', 'ok');
    trace.mark('playback', 'ok');
    trace.mark('avatar', 'ok');

    const finished = trace.finish();
    expect(finished.trace_id).toBe('turn-browser-1');
    expect(finished.stages.map((stage) => stage.stage)).toEqual([
      'mic', 'vad', 'stt', 'agent', 'tts', 'playback', 'avatar',
    ]);
    expect(finished.stages.every((stage) => stage.status === 'ok')).toBe(true);
  });

  it('marks unobserved speech output boundaries as skipped for text-only responses', () => {
    const trace = new BrowserTurnTrace({ now: () => 1000, id: () => 'turn-text-1' });
    trace.begin({ stages: [
      { stage: 'mic', status: 'ok' },
      { stage: 'vad', status: 'ok' },
      { stage: 'stt', status: 'ok' },
      { stage: 'agent', status: 'ok' },
    ] });
    const finished = trace.finish({ textOnly: true });
    expect(finished.stages.find((stage) => stage.stage === 'tts').status).toBe('skipped');
    expect(finished.stages.find((stage) => stage.stage === 'playback').status).toBe('skipped');
    expect(finished.stages.find((stage) => stage.stage === 'avatar').status).toBe('skipped');
  });

  it('attributes a failed pending boundary without guessing a later stage', () => {
    const trace = new BrowserTurnTrace({ now: () => 1000, id: () => 'turn-failed-1' });
    trace.begin({ stages: [
      { stage: 'mic', status: 'ok' },
      { stage: 'vad', status: 'ok' },
      { stage: 'stt', status: 'pending' },
    ] });
    trace.failActive('STT_LOW_CONFIDENCE');
    const finished = trace.finish();
    expect(finished.stages.find((stage) => stage.stage === 'stt')).toMatchObject({
      status: 'failed',
      error_code: 'STT_LOW_CONFIDENCE',
    });
  });

  it('reports the completed trace to the reliability diagnosis endpoint', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({ trace_id: 'turn-browser-2', attributed: false }),
    }));
    const diagnosis = await reportTurnTrace({ trace_id: 'turn-browser-2', stages: [] }, { fetchImpl });
    expect(fetchImpl).toHaveBeenCalledWith('/api/reliability/diagnose', expect.objectContaining({ method: 'POST' }));
    expect(diagnosis.trace_id).toBe('turn-browser-2');
  });
});
