const PIPELINE = Object.freeze(['mic', 'vad', 'stt', 'agent', 'tts', 'playback', 'avatar']);
const TERMINAL = new Set(['ok', 'failed', 'timeout', 'skipped']);

function nowIso(now) {
  return new Date(now()).toISOString();
}

function elapsed(startedAt, completedAt) {
  if (!Number.isFinite(startedAt) || !Number.isFinite(completedAt)) return null;
  return Math.max(0, Math.round(completedAt - startedAt));
}

export class BrowserTurnTrace {
  constructor({ now = () => Date.now(), id = () => globalThis.crypto?.randomUUID?.() || `turn-${Date.now()}` } = {}) {
    this.now = now;
    this.id = id;
    this.current = null;
  }

  begin(seed = {}) {
    const startedAt = this.now();
    this.current = {
      trace_id: seed.trace_id || this.id(),
      created_at: nowIso(this.now),
      started_at_ms: startedAt,
      stages: new Map(),
    };
    for (const stage of seed.stages || []) this.mark(stage.stage, stage.status, stage);
    return this.snapshot();
  }

  get active() {
    return Boolean(this.current);
  }

  mark(stage, status, detail = {}) {
    if (!PIPELINE.includes(stage)) throw new Error(`browser-trace-stage-unknown:${stage}`);
    if (!this.current) this.begin();

    const at = this.now();
    const previous = this.current.stages.get(stage);
    const startedAt = detail.started_at_ms ?? previous?.started_at_ms ?? at;
    const completedAt = TERMINAL.has(status) ? detail.completed_at_ms ?? at : null;
    const entry = {
      stage,
      status,
      error_code: detail.error_code || null,
      started_at: new Date(startedAt).toISOString(),
      completed_at: completedAt === null ? null : new Date(completedAt).toISOString(),
      latency_ms: detail.latency_ms ?? elapsed(startedAt, completedAt),
      detail: detail.detail ?? null,
      started_at_ms: startedAt,
    };
    this.current.stages.set(stage, entry);
    return this.snapshot();
  }

  failActive(errorCode, preferredStage = null) {
    if (!this.current) this.begin();
    const stage = preferredStage
      || PIPELINE.find((name) => this.current.stages.get(name)?.status === 'pending')
      || 'agent';
    return this.mark(stage, 'failed', { error_code: errorCode || null });
  }

  finish({ textOnly = false } = {}) {
    if (!this.current) return null;
    for (const stage of PIPELINE) {
      if (!this.current.stages.has(stage)) this.mark(stage, 'skipped', { detail: { reason: 'not-observed' } });
      else if (this.current.stages.get(stage).status === 'pending') {
        this.mark(stage, textOnly && ['tts', 'playback', 'avatar'].includes(stage) ? 'skipped' : 'timeout');
      }
    }
    const trace = this.snapshot();
    this.current = null;
    return trace;
  }

  snapshot() {
    if (!this.current) return null;
    return {
      trace_id: this.current.trace_id,
      created_at: this.current.created_at,
      stages: PIPELINE
        .map((name) => this.current.stages.get(name))
        .filter(Boolean)
        .map(({ started_at_ms: _internal, ...stage }) => ({ ...stage })),
    };
  }
}

export async function reportTurnTrace(trace, {
  endpoint = '/api/reliability/diagnose',
  fetchImpl = globalThis.fetch,
} = {}) {
  if (!trace || typeof fetchImpl !== 'function') return null;
  const response = await fetchImpl(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(trace),
    keepalive: true,
  });
  if (!response.ok) throw new Error(`turn-trace-report-${response.status}`);
  return response.json();
}

export { PIPELINE as BROWSER_PIPELINE_ORDER };
