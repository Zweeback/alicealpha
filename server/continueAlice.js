import {
  beginCurrentStep,
  failCurrentStep,
  loadRunState,
  saveRunState,
  verifyCurrentStep,
} from './runState.js';
import {
  createBlindspotEntry,
  loadBlindspotLedger,
  saveBlindspotLedger,
  upsertBlindspot,
} from './blindspotLedger.js';

function asBlindspots(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

async function persistBlindspots(path, items, now) {
  if (!items.length) return [];
  let ledger = await loadBlindspotLedger(path);
  const ids = [];
  for (const item of items) {
    const entry = createBlindspotEntry(item, now);
    ledger = upsertBlindspot(ledger, item, now);
    ids.push(entry.id);
  }
  await saveBlindspotLedger(ledger, path);
  return ids.filter(Boolean);
}

export async function continueAlice({
  statePath,
  ledgerPath,
  initialState,
  execute,
  verify,
  now = () => new Date().toISOString(),
} = {}) {
  if (typeof execute !== 'function') throw new TypeError('alice-continue-executor-required');
  if (typeof verify !== 'function') throw new TypeError('alice-continue-verifier-required');

  let state = await loadRunState(statePath, initialState);

  if (state.status === 'complete') {
    return { status: 'complete', state, executed: false };
  }

  if (state.status === 'running') {
    const step = state.steps.find((candidate) => candidate.id === state.current_step_id);
    const recovery = await verify({ step, state, recovery: true });

    if (recovery?.verified === true) {
      state = verifyCurrentStep(state, recovery.evidence || [], now);
      await saveRunState(state, statePath);
      await persistBlindspots(ledgerPath, asBlindspots(recovery.blindspots), now);
      return { status: state.status, state, executed: false, recovered: true };
    }

    state = failCurrentStep(state, 'recovery-verification-required', { blocked: true }, now);
    await saveRunState(state, statePath);
    await persistBlindspots(ledgerPath, [{
      category: 'blocked',
      subject: state.current_step_id || 'unknown-step',
      detail: 'A previous execution was interrupted and cannot be proven complete. Refusing to execute it twice.',
      evidence: recovery?.evidence || [],
    }], now);
    return { status: 'blocked', state, executed: false, recovered: false };
  }

  if (!['ready', 'failed', 'blocked'].includes(state.status)) {
    throw new Error(`alice-continue-state-unsupported:${state.status}`);
  }

  if (state.status !== 'ready') {
    return { status: state.status, state, executed: false };
  }

  state = beginCurrentStep(state, now);
  await saveRunState(state, statePath);
  const step = state.steps.find((candidate) => candidate.id === state.current_step_id);

  try {
    const result = await execute({ step, state });
    const verification = await verify({ step, state, result, recovery: false });
    const blindspots = [
      ...asBlindspots(result?.blindspots),
      ...asBlindspots(verification?.blindspots),
    ];

    if (verification?.verified !== true) {
      state = failCurrentStep(state, 'step-verification-failed', { blocked: true }, now);
      await saveRunState(state, statePath);
      await persistBlindspots(ledgerPath, [
        ...blindspots,
        {
          category: 'unproven',
          subject: step.id,
          detail: 'The step executed but its success could not be verified, so Alice did not advance.',
          evidence: verification?.evidence || [],
        },
      ], now);
      return { status: 'blocked', state, executed: true, result, verification };
    }

    state = verifyCurrentStep(state, verification.evidence || [], now);
    await saveRunState(state, statePath);
    const blindspotIds = await persistBlindspots(ledgerPath, blindspots, now);

    return {
      status: state.status,
      state,
      executed: true,
      result,
      verification,
      blindspot_ids: blindspotIds,
    };
  } catch (error) {
    state = failCurrentStep(state, error, {}, now);
    await saveRunState(state, statePath);
    await persistBlindspots(ledgerPath, [{
      category: 'broken',
      subject: step?.id || 'unknown-step',
      detail: error instanceof Error ? error.message : String(error),
      evidence: [],
    }], now);
    return { status: 'failed', state, executed: true, error: state.last_error };
  }
}
