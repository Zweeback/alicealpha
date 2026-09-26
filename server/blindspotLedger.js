import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

export const DEFAULT_BLINDSPOT_LEDGER_PATH = resolve(process.env.ALICE_BLINDSPOT_LEDGER_PATH || 'data/blindspot-ledger.json');

const CATEGORIES = new Set(['missing', 'unproven', 'broken', 'blocked']);
const DISPOSITIONS = new Set(['pending', 'accepted', 'deferred', 'resolved', 'rejected']);

function fingerprint(input) {
  return createHash('sha256')
    .update(JSON.stringify([input.category, input.subject, input.detail]))
    .digest('hex')
    .slice(0, 16);
}

export function createBlindspotEntry(input, now = () => new Date().toISOString()) {
  if (!CATEGORIES.has(input?.category)) throw new Error('blindspot-category-invalid');
  if (!input?.subject?.trim()) throw new Error('blindspot-subject-required');
  if (!input?.detail?.trim()) throw new Error('blindspot-detail-required');

  return {
    id: input.id || `bs-${fingerprint(input)}`,
    category: input.category,
    subject: input.subject.trim(),
    detail: input.detail.trim(),
    disposition: input.disposition || 'pending',
    evidence: Array.isArray(input.evidence) ? [...input.evidence] : [],
    first_seen_at: input.first_seen_at || now(),
    updated_at: input.updated_at || now(),
    resolved_at: input.resolved_at ?? null,
  };
}

export function createBlindspotLedger(input = {}) {
  return {
    schema: 'alice.blindspots.v1',
    entries: Array.isArray(input.entries) ? input.entries.map((entry) => createBlindspotEntry(entry, () => entry.updated_at || entry.first_seen_at || new Date().toISOString())) : [],
  };
}

export function validateBlindspotLedger(ledger) {
  if (!ledger || ledger.schema !== 'alice.blindspots.v1' || !Array.isArray(ledger.entries)) {
    throw new Error('blindspot-ledger-invalid');
  }
  for (const entry of ledger.entries) {
    if (!CATEGORIES.has(entry.category)) throw new Error('blindspot-category-invalid');
    if (!DISPOSITIONS.has(entry.disposition)) throw new Error('blindspot-disposition-invalid');
  }
  return ledger;
}

export async function loadBlindspotLedger(path = DEFAULT_BLINDSPOT_LEDGER_PATH) {
  try {
    const ledger = JSON.parse(await readFile(path, 'utf8'));
    return validateBlindspotLedger(ledger);
  } catch (error) {
    if (error?.code === 'ENOENT') return createBlindspotLedger();
    throw error;
  }
}

export async function saveBlindspotLedger(ledger, path = DEFAULT_BLINDSPOT_LEDGER_PATH) {
  validateBlindspotLedger(ledger);
  await mkdir(dirname(path), { recursive: true });
  const temp = `${path}.tmp`;
  await writeFile(temp, `${JSON.stringify(ledger, null, 2)}\n`, 'utf8');
  await rename(temp, path);
  return ledger;
}

export function upsertBlindspot(ledger, input, now = () => new Date().toISOString()) {
  validateBlindspotLedger(ledger);
  const entry = createBlindspotEntry(input, now);
  const next = JSON.parse(JSON.stringify(ledger));
  const index = next.entries.findIndex((candidate) => candidate.id === entry.id);

  if (index >= 0) {
    next.entries[index] = {
      ...next.entries[index],
      ...entry,
      first_seen_at: next.entries[index].first_seen_at,
      updated_at: now(),
    };
  } else {
    next.entries.push(entry);
  }
  return next;
}
