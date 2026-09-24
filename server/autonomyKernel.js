import { randomUUID } from 'node:crypto';
import { mayEnterVerifiedMemory } from './evidenceLedger.js';

const PHASES = Object.freeze(['observe', 'diagnose', 'retrieve', 'plan', 'execute', 'verify', 'remember', 'select_next', 'done', 'blocked']);
const NEXT = Object.freeze({
  observe: 'diagnose',
  diagnose: 'retrieve',
  retrieve: 'plan',
  plan: 'execute',
  execute: 'verify',
  verify: 'remember',
  remember: 'select_next',
});

export function getKernelCapabilities() {
  return Object.freeze({
    version: '0.1.0',
    phases: PHASES,
    loop: 'observe -> diagnose -> retrieve -> plan -> execute -> verify -> remember -> select_next',
    fail_closed: true,
    verified_memory_only: true,
    self_attestation: false,
  });
}

export function createKernelTask(input, now = () => new Date().toISOString()) {
  if (!input || typeof input !== 'object') throw new TypeError('kernel-task-input-required');
  if (typeof input.goal !== 'string' || input.goal.trim().length === 0) throw new Error('kernel-goal-required');
  const maxSteps = Number(input.max_steps ?? 24);
  if (!Number.isInteger(maxSteps) || maxSteps < 1 || maxSteps > 200) throw new Error('kernel-max-steps-invalid');

  return Object.freeze({
    id: input.id || randomUUID(),
    goal: input.goal.trim(),
    created_at: now(),
    phase: 'observe',
    step: 0,
    max_steps: maxSteps,
    kill_switch: false,
    history: Object.freeze([]),
  });
}

function append(task, event, nextPhase, now) {
  const history = [...task.history, Object.freeze({
    step: task.step + 1,
    at: now(),
    from: task.phase,
    to: nextPhase,
    event: event.type,
    detail: event.detail ?? null,
  })];
  return Object.freeze({ ...task, phase: nextPhase, step: task.step + 1, history: Object.freeze(history) });
}

export function advanceKernelTask(task, event, now = () => new Date().toISOString()) {
  if (!task || !PHASES.includes(task.phase)) throw new Error('kernel-task-invalid');
  if (!event || typeof event !== 'object' || typeof event.type !== 'string') throw new Error('kernel-event-required');
  if (task.phase === 'done' || task.phase === 'blocked') return task;
  if (task.kill_switch) return append(task, { type: 'kill-switch' }, 'blocked', now);
  if (task.step >= task.max_steps) return append(task, { type: 'step-budget-exhausted' }, 'blocked', now);

  if (event.type === 'kill') return Object.freeze({ ...append(task, event, 'blocked', now), kill_switch: true });
  if (event.type === 'complete') return append(task, event, 'done', now);

  const expected = NEXT[task.phase];
  if (!expected) throw new Error('kernel-transition-not-supported');
  if (event.type !== `${task.phase}.complete`) throw new Error(`kernel-event-invalid-for-${task.phase}`);

  if (task.phase === 'plan' && event.detail?.operator_control?.allowed !== true) {
    return append(task, { ...event, type: 'plan.blocked' }, 'blocked', now);
  }
  if (task.phase === 'verify' && event.detail?.verification?.passed !== true) {
    return append(task, { ...event, type: 'verify.failed' }, 'blocked', now);
  }
  if (task.phase === 'remember') {
    const claims = event.detail?.claims ?? [];
    if (!Array.isArray(claims) || claims.some((claim) => !mayEnterVerifiedMemory(claim))) {
      return append(task, { ...event, type: 'remember.blocked' }, 'blocked', now);
    }
  }

  return append(task, event, expected, now);
}

export function resumeKernelLoop(task, event, now = () => new Date().toISOString()) {
  if (task?.phase !== 'select_next') throw new Error('kernel-select-next-required');
  if (event?.type === 'next.none') return append(task, event, 'done', now);
  if (event?.type === 'next.task') return append(task, event, 'observe', now);
  throw new Error('kernel-next-event-invalid');
}
