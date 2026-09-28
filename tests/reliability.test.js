import { describe, expect, it } from 'vitest';
import {
  createTurnTrace,
  diagnosePipeline,
  evaluateAliceLiveness,
  getCompanionFailureMetadata,
  getFailureDefinition,
  selectRecovery,
  verifyKnownGoodVerticalSlice,
} from '../server/companionReliability.js';

describe('Companion reliability and recovery', () => {
  it('loads the machine-readable failure contract', () => {
    const meta = getCompanionFailureMetadata();

    expect(meta.schema).toBe('alice.failure-registry.v1');
    expect(meta.failures).toBeGreaterThanOrEqual(30);
    expect(meta.contract).toEqual([
      'INPUT','PRECONDITION','STATE','OPERATION','OUTPUT',
      'TIMEOUT','ERROR_CLASS','FALLBACK','RECOVERY','VERIFY',
    ]);
    expect(meta.recovery_ladder).toEqual([
      'RETRY','RESET','RECONNECT','RESTART_WORKER',
      'SUBSTITUTE','DEGRADE','RESTORE','ESCALATE',
    ]);
  });

  it('attributes generated audio without playback to the playback domain', () => {
    const trace = createTurnTrace({
      trace_id: 'turn-playback-1',
      stages: [
        { stage: 'mic', status: 'ok', latency_ms: 20 },
        { stage: 'vad', status: 'ok', latency_ms: 80 },
        { stage: 'stt', status: 'ok', latency_ms: 812 },
        { stage: 'agent', status: 'ok', latency_ms: 436 },
        { stage: 'tts', status: 'ok', latency_ms: 194, detail: { chunks: 83 } },
        { stage: 'playback', status: 'timeout' },
        { stage: 'avatar', status: 'ok' },
      ],
    });

    const diagnosis = diagnosePipeline(trace);
    expect(diagnosis.code).toBe('PLAYBACK_TIMEOUT');
    expect(diagnosis.domain).toBe('playback');
    expect(diagnosis.owner).toBe('audio_output');
    expect(diagnosis.fallback).toBe('text output');
    expect(diagnosis.recovery[0]).toBe('RETRY');
  });

  it('walks a failure-specific recovery sequence without killing Alice', () => {
    expect(selectRecovery('TTS_EMPTY_AUDIO', 0).action).toBe('RETRY');
    expect(selectRecovery('TTS_EMPTY_AUDIO', 1).action).toBe('RESTART_WORKER');
    expect(selectRecovery('TTS_EMPTY_AUDIO', 2).action).toBe('SUBSTITUTE');
    expect(selectRecovery('TTS_EMPTY_AUDIO', 99).action).toBe('ESCALATE');
    expect(getFailureDefinition('TTS_EMPTY_AUDIO').degrade_state).toBe('DEGRADED_AUDIO');
  });

  it('keeps Alice alive when cloud, vision, avatar and audio are degraded but text still works', () => {
    const state = evaluateAliceLiveness({
      identity_valid: true,
      persistent_state_valid: true,
      interaction_inputs: { text: true, microphone: false },
      output_paths: { text: true, speech: false },
      audio_available: false,
      vision_available: false,
      avatar_available: false,
      network_available: false,
      memory_available: true,
    });

    expect(state.alive).toBe(true);
    expect(state.state).toBe('DEGRADED_AUDIO');
    expect(state.degraded).toContain('DEGRADED_NETWORK');
    expect(state.degraded).toContain('DEGRADED_AVATAR');
  });

  it('marks Alice offline only when the liveness contract itself is broken', () => {
    const state = evaluateAliceLiveness({
      identity_valid: true,
      persistent_state_valid: true,
      interaction_inputs: { text: true },
      output_paths: {},
    });

    expect(state.alive).toBe(false);
    expect(state.state).toBe('OFFLINE');
    expect(state.contract.output_path_available).toBe(false);
  });

  it('defines the known-good vertical slice as mic -> stt -> agent -> tts -> avatar', () => {
    expect(verifyKnownGoodVerticalSlice({
      mic: true, stt: true, agent: true, tts: true, avatar: true,
    })).toEqual({
      pass: true,
      stages: ['mic', 'stt', 'agent', 'tts', 'avatar'],
      missing: [],
    });

    const degraded = verifyKnownGoodVerticalSlice({
      mic: true, stt: true, agent: true, tts: false, avatar: true,
    });
    expect(degraded.pass).toBe(false);
    expect(degraded.missing).toEqual(['tts']);
  });

  it('turns an unfinished pipeline into an attribution gap instead of guessing', () => {
    const diagnosis = diagnosePipeline({
      trace_id: 'turn-gap',
      stages: [
        { stage: 'mic', status: 'ok' },
        { stage: 'vad', status: 'ok' },
        { stage: 'stt', status: 'pending' },
      ],
    });

    expect(diagnosis.code).toBe('ATTRIBUTION_GAP');
    expect(diagnosis.attributed).toBe(false);
    expect(diagnosis.stage).toBe('stt');
  });
});
