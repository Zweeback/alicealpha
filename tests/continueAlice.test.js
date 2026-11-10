import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  createBlindspotLedger,
  loadBlindspotLedger,
  saveBlindspotLedger,
} from '../server/blindspotLedger.js';
import { continueAlice } from '../server/continueAlice.js';

describe('continueAlice', () => {
  it('executes one step, verifies it, persists state, and returns the updated blindspot id', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'alice-continue-'));
    const statePath = join(directory, 'state.json');
    const ledgerPath = join(directory, 'ledger.json');

    await saveBlindspotLedger(createBlindspotLedger({
      entries: [
        {
          id: 'bs-first',
          category: 'blocked',
          subject: 'existing',
          detail: 'old detail',
          disposition: 'resolved',
          first_seen_at: '2026-09-26T20:00:00.000Z',
          updated_at: '2026-09-26T20:00:00.000Z',
        },
        {
          id: 'bs-last',
          category: 'missing',
          subject: 'other',
          detail: 'leave me last',
          disposition: 'pending',
          first_seen_at: '2026-09-26T20:01:00.000Z',
          updated_at: '2026-09-26T20:01:00.000Z',
        },
      ],
    }), ledgerPath);

    const execute = vi.fn(async () => ({
      changed: true,
      blindspots: [{
        id: 'bs-first',
        category: 'blocked',
        subject: 'existing',
        detail: 'new detail',
      }],
    }));
    const verify = vi.fn(async ({ result }) => ({
      verified: result?.changed === true,
      evidence: ['test:green'],
    }));

    const result = await continueAlice({
      statePath,
      ledgerPath,
      initialState: {
        run_id: 'run-1',
        goal: 'Bring alicealpha weiter',
        steps: [{ id: 'step-1', description: 'Execute and verify one step' }],
      },
      execute,
      verify,
      now: () => '2026-09-26T22:00:00.000Z',
    });

    expect(execute).toHaveBeenCalledOnce();
    expect(verify).toHaveBeenCalledOnce();
    expect(result.status).toBe('complete');
    expect(result.executed).toBe(true);
    expect(result.blindspot_ids).toEqual(['bs-first']);

    const persistedState = JSON.parse(await readFile(statePath, 'utf8'));
    expect(persistedState.status).toBe('complete');
    expect(persistedState.steps[0].status).toBe('verified');
    expect(persistedState.verified_evidence).toContain('test:green');

    const ledger = await loadBlindspotLedger(ledgerPath);
    expect(ledger.entries[0].id).toBe('bs-first');
    expect(ledger.entries[0].detail).toBe('new detail');
    expect(ledger.entries[0].disposition).toBe('resolved');
    expect(ledger.entries[1].id).toBe('bs-last');
  });
});
