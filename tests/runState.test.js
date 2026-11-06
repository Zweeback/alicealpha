import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadRunState } from '../server/runState.js';

describe('Alice run state', () => {
  it('bootstraps a valid initial state when the state file does not exist', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'alice-run-state-'));
    const path = join(directory, 'missing.json');

    const state = await loadRunState(path, {
      run_id: 'run-bootstrap',
      goal: 'Bootstrap Alice continue',
      steps: [{ id: 'step-1', description: 'Execute one bounded step' }],
    });

    expect(state.run_id).toBe('run-bootstrap');
    expect(state.status).toBe('ready');
    expect(state.current_step_id).toBe('step-1');
    expect(state.next_step).toBe('Execute one bounded step');
  });
});
