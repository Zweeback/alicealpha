import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

export const DEFAULT_RUN_STATE_PATH = resolve(process.env.ALICE_RUN_STATE_PATH || 'data/alice_run_state.json');

const STEP_STATUS = new Set(['pending', 'running', 'verified', 'failed', 'blocked']);
const RUN_STATUS = new Set(['ready', 'running', 'complete', 'failed', 'blocked']);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeStep(step, index) {
  if (!step?.id || typeof step.id !== 'string') throw new Error(`run-step-id-required:${index}`);
  if (!step?.description || typeof step.description !== 'string') throw new Error(`run-step-description-required:${step.id}`);
  const status = step.status || 'pending';
  if (!STEP_STATUS.has(status)) throw new Error(`run-step-status-invalid:${step.id}`);
  return {
    id: step.id,
    description: step.description,
    kind: step.kind || 'work',
    status,
    payload: step.payload ?? null,
    started_at: step.started_at ?? null,
    verified_at: step.verified_at ?? null,
    evidence: Array.isArray(step.evidence) ? [...step.evidence] : [],
    error: step.error ?? null,
  };
}

export function createRunState(input = {}, now = () => new Date().toISOString()) {
  const steps = (input.steps || []).map(normalizeStep);
  const firstPending = steps.find((step) => step.status === 'pending');
  const status = input.status || (firstPending ? 'ready' : 'complete');
  if (!RUN_STATUS.has(status)) throw new Error('run-status-invalid');

  return {
    schema: 'alice.run.v1',
    run_id: input.run_id || randomUUID(),
    goal: input.goal || 'Bring alicealpha weiter',
    repository: input.repository || 'Zweeback/alicealpha',
    status,
    created_at: input.created_at || now(),
    updated_at: input.updated_at || now(),
    current_step_id: input.current_step_id || firstPending?.id || null,
    next_step: input.next_step || firstPending?.description || null,
    steps,
    verified_evidence: Array.isArray(input.verified_evidence) ? [...input.verified_evidence] : [],
    last_error: input.last_error ?? null,
  };
}

export function validateRunState(state) {
  if (!state || state.schema !== 'alice.run.v1') throw new Error('run-state-schema-invalid');
  if (!state.run_id || !state.goal || !state.repository) throw new Error('run-state-required-field-missing');
  if (!RUN_STATUS.has(state.status)) throw new Error('run-status-invalid');
  if (!Array.isArray(state.steps)) throw new Error('run-steps-invalid');
  state.steps.forEach(normalizeStep);
  return state;
}

export async function loadRunState(path = DEFAULT_RUN_STATE_PATH, initialState = {}) {
  try {
    const raw = await readFile(path, 'utf8');
    const state = JSON.parse(raw);
    validateRunState(state);
    return state;
  } catch (error) {
    if (error?.code === 'ENOENT') return createRunState(initialState);
    throw error;
  }
}

export async function saveRunState(state, path = DEFAULT_RUN_STATE_PATH) {
  validateRunState(state);
  await mkdir(dirname(path), { recursive: true });
  const temp = `${path}.tmp`;
  await writeFile(temp, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  await rename(temp, path);
  return state;
}

function currentStepIndex(state) {
  if (!state.current_step_id) return -1;
  return state.steps.findIndex((step) => step.id === state.current_step_id);
}

export function beginCurrentStep(state, now = () => new Date().toISOString()) {
  validateRunState(state);
  const next = clone(state);
  const index = currentStepIndex(next);
  if (index < 0) throw new Error('run-current-step-missing');
  if (next.steps[index].status !== 'pending') throw new Error('run-current-step-not-pending');

  next.steps[index].status = 'running';
  next.steps[index].started_at = now();
  next.status = 'running';
  next.updated_at = now();
  next.last_error = null;
  return next;
}

export function verifyCurrentStep(state, evidence = [], now = () => new Date().toISOString()) {
  validateRunState(state);
  const next = clone(state);
  const index = currentStepIndex(next);
  if (index < 0) throw new Error('run-current-step-missing');
  if (next.steps[index].status !== 'running') throw new Error('run-current-step-not-running');

  const normalizedEvidence = Array.isArray(evidence) ? evidence : [evidence];
  next.steps[index].status = 'verified';
  next.steps[index].verified_at = now();
  next.steps[index].evidence.push(...normalizedEvidence.filter(Boolean));
  next.verified_evidence.push(...normalizedEvidence.filter(Boolean));

  const following = next.steps.find((step) => step.status === 'pending');
  next.current_step_id = following?.id || null;
  next.next_step = following?.description || null;
  next.status = following ? 'ready' : 'complete';
  next.updated_at = now();
  next.last_error = null;
  return next;
}

export function failCurrentStep(state, error, { blocked = false } = {}, now = () => new Date().toISOString()) {
  validateRunState(state);
  const next = clone(state);
  const index = currentStepIndex(next);
  if (index < 0) throw new Error('run-current-step-missing');

  const message = error instanceof Error ? error.message : String(error || 'unknown-error');
  next.steps[index].status = blocked ? 'blocked' : 'failed';
  next.steps[index].error = message;
  next.status = blocked ? 'blocked' : 'failed';
  next.last_error = message;
  next.updated_at = now();
  return next;
}
