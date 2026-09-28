import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

const REGISTRY_URL = new URL('../data/failure-registry.yaml', import.meta.url);
const REGISTRY = Object.freeze(JSON.parse(readFileSync(REGISTRY_URL, 'utf8')));
const FAILURE_BY_CODE = new Map(REGISTRY.failures.map((failure) => [failure.code, Object.freeze(failure)]));

export const PIPELINE_ORDER = Object.freeze([...REGISTRY.pipeline_order]);
export const RECOVERY_LADDER = Object.freeze([...REGISTRY.recovery_ladder]);
export const RUNTIME_STATES = Object.freeze([...REGISTRY.runtime_states]);
export const KNOWN_GOOD_VERTICAL_SLICE = Object.freeze(['mic', 'stt', 'agent', 'tts', 'avatar']);

const STAGE_DEFAULT_FAILURE = Object.freeze({
  mic: 'MIC_UNAVAILABLE',
  vad: 'VAD_FALSE_TRIGGER',
  stt: 'STT_LOW_CONFIDENCE',
  agent: 'LLM_TIMEOUT',
  tts: 'TTS_EMPTY_AUDIO',
  playback: 'PLAYBACK_TIMEOUT',
  avatar: 'LIPSYNC_NO_SIGNAL',
});

const TERMINAL = new Set(['ok', 'failed', 'timeout', 'skipped']);

function normalizeStage(stage) {
  if (!stage || typeof stage !== 'object') throw new TypeError('reliability-stage-required');
  const name = String(stage.stage || '').trim();
  if (!PIPELINE_ORDER.includes(name)) throw new Error(`reliability-stage-unknown:${name || 'empty'}`);
  const status = String(stage.status || 'pending').toLowerCase();
  if (!['pending', 'ok', 'failed', 'timeout', 'skipped'].includes(status)) {
    throw new Error(`reliability-stage-status-invalid:${status}`);
  }
  return Object.freeze({
    stage: name,
    status,
    error_code: stage.error_code || null,
    started_at: stage.started_at ?? null,
    completed_at: stage.completed_at ?? null,
    latency_ms: Number.isFinite(Number(stage.latency_ms)) ? Number(stage.latency_ms) : null,
    detail: stage.detail ?? null,
  });
}

export function getCompanionFailureRegistry() {
  return REGISTRY;
}

export function getCompanionFailureMetadata() {
  return Object.freeze({
    schema: REGISTRY.schema,
    schema_version: REGISTRY.schema_version,
    failures: REGISTRY.failures.length,
    contract: Object.freeze([...REGISTRY.contract]),
    recovery_ladder: RECOVERY_LADDER,
    runtime_states: RUNTIME_STATES,
    pipeline_order: PIPELINE_ORDER,
    liveness: Object.freeze({ ...REGISTRY.liveness }),
  });
}

export function getFailureDefinition(code) {
  return FAILURE_BY_CODE.get(code) || null;
}

export function createTurnTrace(input = {}) {
  return Object.freeze({
    trace_id: input.trace_id || randomUUID(),
    created_at: input.created_at || new Date().toISOString(),
    stages: Object.freeze((input.stages || []).map(normalizeStage)),
  });
}

export function diagnosePipeline(input = {}) {
  const trace = input.stages ? createTurnTrace(input) : input;
  const stages = Array.isArray(trace?.stages) ? trace.stages.map(normalizeStage) : [];
  const byStage = new Map(stages.map((stage) => [stage.stage, stage]));

  for (const stageName of PIPELINE_ORDER) {
    const stage = byStage.get(stageName);
    if (!stage) continue;
    if (stage.status === 'failed' || stage.status === 'timeout') {
      const code = stage.error_code || STAGE_DEFAULT_FAILURE[stageName] || 'ATTRIBUTION_GAP';
      const failure = getFailureDefinition(code) || getFailureDefinition('ATTRIBUTION_GAP');
      return Object.freeze({
        trace_id: trace.trace_id || null,
        attributed: true,
        stage: stageName,
        code: failure.code,
        domain: failure.domain,
        owner: failure.owner,
        observed: failure.observed,
        probe: failure.probe,
        fallback: failure.fallback,
        degrade_state: failure.degrade_state,
        recovery: Object.freeze([...failure.recovery]),
        regression_test: failure.regression_test,
      });
    }
  }

  const nonTerminal = stages.filter((stage) => !TERMINAL.has(stage.status));
  if (nonTerminal.length > 0) {
    const failure = getFailureDefinition('ATTRIBUTION_GAP');
    return Object.freeze({
      trace_id: trace.trace_id || null,
      attributed: false,
      stage: nonTerminal[0].stage,
      code: failure.code,
      domain: failure.domain,
      owner: failure.owner,
      observed: failure.observed,
      probe: failure.probe,
      fallback: failure.fallback,
      degrade_state: failure.degrade_state,
      recovery: Object.freeze([...failure.recovery]),
      regression_test: failure.regression_test,
    });
  }

  return Object.freeze({
    trace_id: trace?.trace_id || null,
    attributed: false,
    stage: null,
    code: null,
    domain: null,
    owner: null,
    observed: null,
    probe: null,
    fallback: null,
    degrade_state: null,
    recovery: Object.freeze([]),
    regression_test: null,
  });
}

export function selectRecovery(code, attempt = 0) {
  const failure = getFailureDefinition(code);
  if (!failure) return null;
  const index = Math.max(0, Math.floor(Number(attempt) || 0));
  const action = failure.recovery[Math.min(index, failure.recovery.length - 1)] || 'ESCALATE';
  return Object.freeze({
    code,
    action,
    fallback: failure.fallback,
    degrade_state: failure.degrade_state,
    verify: failure.probe,
  });
}

function anyAvailable(value) {
  if (Array.isArray(value)) return value.some(Boolean);
  if (value && typeof value === 'object') return Object.values(value).some(Boolean);
  return Boolean(value);
}

export function evaluateAliceLiveness(snapshot = {}) {
  const identityValid = snapshot.identity_valid === true;
  const persistentStateValid = snapshot.persistent_state_valid === true;
  const inputAvailable = anyAvailable(snapshot.interaction_inputs);
  const outputAvailable = anyAvailable(snapshot.output_paths);
  const alive = identityValid && persistentStateValid && inputAvailable && outputAvailable;

  const degraded = [];
  if (snapshot.audio_available === false) degraded.push('DEGRADED_AUDIO');
  if (snapshot.vision_available === false) degraded.push('DEGRADED_VISION');
  if (snapshot.memory_available === false) degraded.push('DEGRADED_MEMORY');
  if (snapshot.avatar_available === false) degraded.push('DEGRADED_AVATAR');
  if (snapshot.network_available === false) degraded.push('DEGRADED_NETWORK');

  return Object.freeze({
    alive,
    state: alive ? (degraded[0] || 'READY') : 'OFFLINE',
    degraded: Object.freeze(degraded),
    contract: Object.freeze({
      identity_valid: identityValid,
      persistent_state_valid: persistentStateValid,
      interaction_input_available: inputAvailable,
      output_path_available: outputAvailable,
    }),
  });
}

export function verifyKnownGoodVerticalSlice(probes = {}) {
  const missing = KNOWN_GOOD_VERTICAL_SLICE.filter((stage) => probes[stage] !== true);
  return Object.freeze({
    pass: missing.length === 0,
    stages: KNOWN_GOOD_VERTICAL_SLICE,
    missing: Object.freeze(missing),
  });
}
