import { createHash, randomUUID } from 'node:crypto';

const CLAIM_TYPES = new Set(['fact', 'observation', 'decision', 'test_result', 'capability', 'artifact']);
const CLAIM_STATUS = new Set(['candidate', 'verified', 'rejected', 'superseded']);
const TRUST = new Set(['untrusted', 'external', 'project', 'verified']);
const SECRET_KEY = /(token|secret|password|cookie|authorization|api[_-]?key|credential|private[_-]?key|library[_-]?card|ausweis(?:nummer)?)/i;

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function hasSecretField(value) {
  if (Array.isArray(value)) return value.some(hasSecretField);
  if (!value || typeof value !== 'object') return false;
  return Object.entries(value).some(([key, child]) => SECRET_KEY.test(key) || hasSecretField(child));
}

function normalizeSource(source) {
  if (!source || typeof source !== 'object') throw new Error('evidence-source-required');
  if (typeof source.ref !== 'string' || source.ref.trim().length === 0) throw new Error('evidence-source-ref-required');
  const trust = source.trust ?? 'external';
  if (!TRUST.has(trust)) throw new Error('evidence-source-trust-invalid');
  return Object.freeze({
    ref: source.ref.trim(),
    kind: source.kind ?? 'source',
    trust,
    sha256: source.sha256 ?? null,
  });
}

export function createEvidenceClaim(input, now = () => new Date().toISOString()) {
  if (!input || typeof input !== 'object') throw new TypeError('evidence-input-required');
  if (!CLAIM_TYPES.has(input.type)) throw new Error('evidence-claim-type-invalid');
  if (typeof input.claim !== 'string' || input.claim.trim().length === 0) throw new Error('evidence-claim-required');
  if (!Array.isArray(input.sources) || input.sources.length === 0) throw new Error('evidence-sources-required');
  if (hasSecretField(input.payload)) throw new Error('evidence-secret-field-forbidden');

  const id = input.id || randomUUID();
  const sources = input.sources.map(normalizeSource);
  const payload = input.payload ?? null;
  const canonical = {
    type: input.type,
    claim: input.claim.trim(),
    sources,
    environment: input.environment ?? null,
    payload,
  };

  return Object.freeze({
    id,
    created_at: now(),
    type: input.type,
    claim: canonical.claim,
    sources: Object.freeze(sources),
    environment: canonical.environment,
    payload,
    status: 'candidate',
    sha256: createHash('sha256').update(stableJson(canonical)).digest('hex'),
    verification: null,
  });
}

export function verifyEvidenceClaim(claim, verification, now = () => new Date().toISOString()) {
  if (!claim || claim.status !== 'candidate') throw new Error('evidence-candidate-required');
  if (!verification || typeof verification !== 'object') throw new Error('evidence-verification-required');
  if (!['verified', 'rejected'].includes(verification.status)) throw new Error('evidence-verification-status-invalid');
  if (typeof verification.verifier !== 'string' || verification.verifier.trim().length === 0) throw new Error('evidence-verifier-required');
  if (/^(alice|agent|model)(:|$)/i.test(verification.verifier.trim())) throw new Error('evidence-self-attestation-forbidden');
  if (!Array.isArray(verification.evidence) || verification.evidence.length === 0) throw new Error('evidence-verification-proof-required');

  return Object.freeze({
    ...claim,
    status: verification.status,
    verification: Object.freeze({
      verifier: verification.verifier.trim(),
      evidence: Object.freeze([...verification.evidence]),
      verified_at: now(),
      note: verification.note ?? null,
    }),
  });
}

export function supersedeEvidenceClaim(claim, replacementId) {
  if (!claim || !CLAIM_STATUS.has(claim.status)) throw new Error('evidence-claim-invalid');
  if (typeof replacementId !== 'string' || replacementId.length === 0) throw new Error('evidence-replacement-required');
  return Object.freeze({ ...claim, status: 'superseded', superseded_by: replacementId });
}

export function mayEnterVerifiedMemory(claim) {
  return Boolean(
    claim
    && claim.status === 'verified'
    && /^[a-f0-9]{64}$/.test(claim.sha256 ?? '')
    && Array.isArray(claim.verification?.evidence)
    && claim.verification.evidence.length > 0,
  );
}

export function createEvidenceLedger(claims = []) {
  const byHash = new Map();
  for (const claim of claims) {
    if (!claim?.sha256) throw new Error('evidence-ledger-claim-invalid');
    const existing = byHash.get(claim.sha256);
    if (!existing || (existing.status !== 'verified' && claim.status === 'verified')) byHash.set(claim.sha256, claim);
  }
  const entries = [...byHash.values()];
  return Object.freeze({
    entries: Object.freeze(entries),
    verified: Object.freeze(entries.filter(mayEnterVerifiedMemory)),
    candidates: Object.freeze(entries.filter((entry) => entry.status === 'candidate')),
    rejected: Object.freeze(entries.filter((entry) => entry.status === 'rejected')),
  });
}
