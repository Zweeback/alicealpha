import { describe, expect, it } from 'vitest';
import {
  createBlindspotLedger,
  upsertBlindspot,
} from '../server/blindspotLedger.js';

describe('blindspot ledger', () => {
  it('updates a non-last entry without changing its id or an existing disposition', () => {
    const ledger = createBlindspotLedger({
      entries: [
        {
          id: 'bs-first',
          category: 'blocked',
          subject: 'step-1',
          detail: 'original detail',
          disposition: 'resolved',
          first_seen_at: '2026-09-26T20:00:00.000Z',
          updated_at: '2026-09-26T20:00:00.000Z',
        },
        {
          id: 'bs-last',
          category: 'missing',
          subject: 'step-2',
          detail: 'other detail',
          disposition: 'pending',
          first_seen_at: '2026-09-26T20:01:00.000Z',
          updated_at: '2026-09-26T20:01:00.000Z',
        },
      ],
    });

    const updated = upsertBlindspot(ledger, {
      id: 'bs-first',
      category: 'blocked',
      subject: 'step-1',
      detail: 'updated detail',
    }, () => '2026-09-26T21:00:00.000Z');

    expect(updated.entries).toHaveLength(2);
    expect(updated.entries[0].id).toBe('bs-first');
    expect(updated.entries[0].detail).toBe('updated detail');
    expect(updated.entries[0].disposition).toBe('resolved');
    expect(updated.entries[1].id).toBe('bs-last');
  });
});
