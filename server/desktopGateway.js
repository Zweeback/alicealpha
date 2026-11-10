// Alice Desktop-Gateway: a bounded, human-approved queue between Alice's
// surfaces (3D web UI, later the model) and ONE paired local desktop client.
//
// Boundaries (see AGENTS.md):
// - Only allowlisted, schema-checked actions. There is no command, shell,
//   file-system or browser-automation action and none can be added by payload.
// - The server never executes anything. The local client shows each proposal
//   to the person at the desktop, who approves or rejects it THERE. Execution
//   results are recorded as reported by that client, not as server-verified.
// - Every state change is appended to a hash-chained provenance journal that
//   keeps who/when/what and the evidence class apart:
//     asserted = claimed by the proposer (e.g. reason, source reference)
//     observed = checked by this server itself (hash match, expiry, delivery)
//     reported = relayed by the paired desktop client (human decision, result)
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';

export const DESKTOP_ACTIONS = Object.freeze({
  'url.open': Object.freeze({
    label: 'Link im Standardbrowser öffnen',
    risk: 'elevated',
    validate(params) {
      const raw = typeof params?.url === 'string' ? params.url.trim() : '';
      if (!raw || raw.length > 2048) throw new Error('desktop-url-invalid');
      let url;
      try { url = new URL(raw); } catch { throw new Error('desktop-url-invalid'); }
      if (url.protocol !== 'https:') throw new Error('desktop-url-https-only');
      if (url.username || url.password) throw new Error('desktop-url-credentials-forbidden');
      return { url: url.href };
    },
  }),
  'clipboard.write': Object.freeze({
    label: 'Text in die Zwischenablage legen',
    risk: 'elevated',
    validate(params) {
      const text = typeof params?.text === 'string' ? params.text : '';
      if (!text.trim() || text.length > 2000) throw new Error('desktop-text-invalid');
      return { text };
    },
  }),
  'note.show': Object.freeze({
    label: 'Notiz im Desktop-Client anzeigen',
    risk: 'low',
    validate(params) {
      const text = typeof params?.text === 'string' ? params.text.trim() : '';
      if (!text || text.length > 2000) throw new Error('desktop-text-invalid');
      return { text };
    },
  }),
});

const SECRET_TEXT = /(passwor[dt]|api[_-]?key|secret|bearer\s+[a-z0-9._-]{8,}|token\s*[:=])/i;
const SOURCE_KINDS = new Set(['user', 'alice-ui', 'model', 'artifact']);
const OPEN_STATES = new Set(['pending', 'delivered', 'approved']);

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export const sha256 = (value) => createHash('sha256').update(typeof value === 'string' ? value : stableJson(value)).digest('hex');

export function desktopPayloadHash(action, params) {
  return sha256({ action, params });
}

function cleanText(value, max) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

// Constant-time comparison for hex digests (payload hashes echoed by the client).
export function hashesMatch(expected, provided) {
  if (typeof expected !== 'string' || typeof provided !== 'string' || expected.length !== provided.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(provided));
}

export function tokensMatch(expected, provided) {
  if (typeof expected !== 'string' || expected.length < 16 || typeof provided !== 'string') return false;
  const a = Buffer.from(sha256(expected));
  const b = Buffer.from(sha256(provided));
  return timingSafeEqual(a, b);
}

export function desktopGatewayConfig(env = process.env) {
  const enabled = env.ALICE_DESKTOP_GATEWAY === '1';
  const clientToken = typeof env.ALICE_DESKTOP_CLIENT_TOKEN === 'string' ? env.ALICE_DESKTOP_CLIENT_TOKEN : '';
  const proposerToken = typeof env.ALICE_DESKTOP_PROPOSER_TOKEN === 'string' ? env.ALICE_DESKTOP_PROPOSER_TOKEN : '';
  // Fail closed: both credentials must exist, be long enough and differ, so a
  // proposer can never act as the executing desktop client (or vice versa).
  const reason = !enabled ? 'gateway-disabled'
    : clientToken.length < 16 ? 'client-token-missing-or-short'
      : proposerToken.length < 16 ? 'proposer-token-missing-or-short'
        : clientToken === proposerToken ? 'tokens-must-differ'
          : null;
  return Object.freeze({
    enabled: reason === null,
    reason,
    ttlMs: Math.max(30_000, Number(env.ALICE_DESKTOP_PROPOSAL_TTL_MS || 10 * 60_000)),
  });
}

export function createDesktopGateway({
  now = () => Date.now(), ttlMs = 10 * 60_000, maxOpen = 20, idFactory = randomUUID,
  maxFinal = 50, maxJournal = 500,
} = {}) {
  const proposals = new Map();
  // In-memory only, bounded. Pruned entries leave an anchor (the hash the
  // oldest kept entry points to) so the kept suffix stays verifiable.
  const journal = [];
  let journalAnchor = null;
  let seqCounter = 0;
  let clientSeenAt = null;
  let clientLabel = null;

  const iso = (ms) => new Date(ms).toISOString();

  function append(proposal, event, actor, evidence, detail = {}) {
    const prev = journal.length ? journal[journal.length - 1].hash : journalAnchor;
    const entry = {
      seq: ++seqCounter,
      at: iso(now()),
      proposal_id: proposal.id,
      event,
      actor,
      evidence,
      payload_sha256: proposal.payload_sha256,
      detail,
      prev_hash: prev,
    };
    entry.hash = sha256({ ...entry });
    journal.push(Object.freeze(entry));
    proposal.journal.push(entry);
    while (journal.length > maxJournal) journalAnchor = journal.shift().hash;
    return entry;
  }

  function prune() {
    const finals = [...proposals.values()].filter((item) => !OPEN_STATES.has(item.state));
    for (const item of finals.slice(0, Math.max(0, finals.length - maxFinal))) proposals.delete(item.id);
  }

  function expire() {
    const t = now();
    for (const proposal of proposals.values()) {
      if ((proposal.state === 'pending' || proposal.state === 'delivered') && t - proposal.created_ms > ttlMs) {
        proposal.state = 'expired';
        append(proposal, 'expired', 'server', 'observed', { ttl_ms: ttlMs });
      }
    }
    prune();
  }

  function view(proposal) {
    return Object.freeze({
      id: proposal.id,
      action: proposal.action,
      label: DESKTOP_ACTIONS[proposal.action].label,
      risk: DESKTOP_ACTIONS[proposal.action].risk,
      params: proposal.params,
      payload_sha256: proposal.payload_sha256,
      reason: proposal.reason,
      source: proposal.source,
      state: proposal.state,
      created_at: iso(proposal.created_ms),
      expires_at: iso(proposal.created_ms + ttlMs),
      decision: proposal.decision,
      result: proposal.result,
      journal: proposal.journal.slice(),
    });
  }

  function get(id) {
    expire();
    const proposal = proposals.get(id);
    if (!proposal) throw new Error('desktop-proposal-not-found');
    return proposal;
  }

  return {
    propose(input = {}, proposer = 'alice-ui:anonymous') {
      expire();
      const spec = DESKTOP_ACTIONS[input.action];
      if (!spec) throw new Error('desktop-action-not-allowed');
      const params = spec.validate(input.params);
      const reason = cleanText(input.reason, 280);
      if (SECRET_TEXT.test(stableJson(params)) || SECRET_TEXT.test(reason)) throw new Error('desktop-secret-like-content-forbidden');
      const sourceKind = SOURCE_KINDS.has(input.source?.kind) ? input.source.kind : 'alice-ui';
      const source = Object.freeze({ kind: sourceKind, ref: cleanText(input.source?.ref, 200) || null, verified: false });
      const open = [...proposals.values()].filter((item) => OPEN_STATES.has(item.state)).length;
      if (open >= maxOpen) throw new Error('desktop-queue-full');
      const proposal = {
        id: idFactory(),
        action: input.action,
        params,
        payload_sha256: desktopPayloadHash(input.action, params),
        reason: reason || null,
        source,
        state: 'pending',
        created_ms: now(),
        decision: null,
        result: null,
        journal: [],
      };
      proposals.set(proposal.id, proposal);
      append(proposal, 'proposed', proposer, 'asserted', { reason: proposal.reason, source });
      return view(proposal);
    },

    read(id) {
      return view(get(id));
    },

    list() {
      expire();
      return [...proposals.values()].map(view);
    },

    // Desktop client: take the oldest pending proposal for local review.
    next(client = 'desktop-client') {
      expire();
      clientSeenAt = now();
      clientLabel = client;
      const proposal = [...proposals.values()].find((item) => item.state === 'pending');
      if (!proposal) return null;
      proposal.state = 'delivered';
      append(proposal, 'delivered', 'server', 'observed', { client });
      return view(proposal);
    },

    decide(id, { decision, actor, payload_sha256: hash } = {}, client = 'desktop-client') {
      const proposal = get(id);
      clientSeenAt = now();
      if (proposal.state !== 'delivered') throw new Error('desktop-proposal-not-awaiting-decision');
      if (!hashesMatch(proposal.payload_sha256, hash)) {
        append(proposal, 'hash-mismatch', 'server', 'observed', { stage: 'decision', client });
        throw new Error('desktop-payload-hash-mismatch');
      }
      if (decision !== 'approved' && decision !== 'rejected') throw new Error('desktop-decision-invalid');
      if (typeof actor !== 'string' || !/^human:[\w.@-]{1,64}$/.test(actor)) throw new Error('desktop-human-actor-required');
      proposal.state = decision;
      proposal.decision = Object.freeze({ decision, actor, via: client });
      append(proposal, decision, actor, 'reported', { via: client });
      return view(proposal);
    },

    report(id, { status, payload_sha256: hash, observation } = {}, client = 'desktop-client') {
      const proposal = get(id);
      clientSeenAt = now();
      if (proposal.state !== 'approved') throw new Error('desktop-proposal-not-approved');
      if (!hashesMatch(proposal.payload_sha256, hash)) {
        append(proposal, 'hash-mismatch', 'server', 'observed', { stage: 'result', client });
        throw new Error('desktop-payload-hash-mismatch');
      }
      if (status !== 'succeeded' && status !== 'failed') throw new Error('desktop-result-status-invalid');
      proposal.state = status;
      proposal.result = Object.freeze({ status, observation: cleanText(observation, 500) || null, reported_by: client });
      append(proposal, status, client, 'reported', { observation: proposal.result.observation });
      return view(proposal);
    },

    status() {
      expire();
      const counts = {};
      for (const proposal of proposals.values()) counts[proposal.state] = (counts[proposal.state] || 0) + 1;
      const seenMs = clientSeenAt === null ? null : now() - clientSeenAt;
      return Object.freeze({
        client: Object.freeze({
          connected: seenMs !== null && seenMs < 30_000,
          last_seen_at: clientSeenAt === null ? null : iso(clientSeenAt),
          label: clientLabel,
        }),
        counts: Object.freeze(counts),
        journal_head: journal.length ? journal[journal.length - 1].hash : journalAnchor,
        journal_length: journal.length,
        journal_anchor: journalAnchor,
        retention: Object.freeze({ max_final_proposals: maxFinal, max_journal_entries: maxJournal, durable: false }),
      });
    },

    journal() {
      return { anchor: journalAnchor, entries: journal.slice() };
    },
  };
}

export function verifyJournal(entries, anchor = null) {
  let prev = anchor;
  for (const entry of entries) {
    const { hash, ...rest } = entry;
    if (rest.prev_hash !== prev || sha256({ ...rest }) !== hash) return { ok: false, broken_at: entry.seq };
    prev = hash;
  }
  return { ok: true, length: entries.length, head: prev };
}
