import { timingSafeEqual } from 'node:crypto';

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const DEFAULT_MAX_EVENTS = 250;

function safeLabel(value) {
  return typeof value === 'string' && /^[a-z0-9][a-z0-9._:/-]{0,119}$/i.test(value)
    ? value
    : 'unknown';
}

function reportedCount(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function classifyError(value) {
  return typeof value === 'string'
    && /^(?:http_[1-5][0-9]{2}|timeout|transport|empty_response|provider_error)$/.test(value)
    ? value
    : 'provider_error';
}

export function createLocalObservabilityStore({ maxEvents = DEFAULT_MAX_EVENTS } = {}) {
  const capacity = Number.isSafeInteger(maxEvents)
    ? Math.min(1000, Math.max(1, maxEvents))
    : DEFAULT_MAX_EVENTS;
  const events = [];

  return {
    record(attempt) {
      if (!attempt || typeof attempt.provider !== 'string' || typeof attempt.model !== 'string') {
        return false;
      }
      if (attempt.outcome !== 'success' && attempt.outcome !== 'error') return false;
      const start = Date.parse(attempt.startedAt);
      const end = Date.parse(attempt.completedAt);
      if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return false;

      const rawUsage = attempt.usage && typeof attempt.usage === 'object' ? attempt.usage : {};
      const usage = {
        input: reportedCount(rawUsage.input_tokens),
        output: reportedCount(rawUsage.output_tokens),
        total: reportedCount(rawUsage.total_tokens),
      };
      const hasUsage = Object.values(usage).some((value) => value !== null);
      // Strict allowlist: never store prompts, replies, memory, user IDs, raw errors or credentials.
      const event = {
        provider: safeLabel(attempt.provider),
        model: safeLabel(attempt.model),
        outcome: attempt.outcome,
        durationMs: Math.round(end - start),
        ...(attempt.outcome === 'error' ? { errorType: classifyError(attempt.errorType) } : {}),
        ...(hasUsage ? { reportedTokens: usage } : {}),
      };
      events.push(event);
      if (events.length > capacity) events.shift();
      return true;
    },

    snapshot() {
      const list = events.map((event) => ({
        ...event,
        ...(event.reportedTokens ? { reportedTokens: { ...event.reportedTokens } } : {}),
      }));
      return {
        storage: 'memory',
        scope: 'current-process-bounded-window',
        maxEvents: capacity,
        count: list.length,
        success: list.filter((event) => event.outcome === 'success').length,
        error: list.filter((event) => event.outcome === 'error').length,
        totalDurationMs: list.reduce((sum, event) => sum + event.durationMs, 0),
        attemptsWithReportedUsage: list.filter((event) => event.reportedTokens).length,
        reportedTokens: {
          input: list.reduce((sum, event) => sum + (event.reportedTokens?.input ?? 0), 0),
          output: list.reduce((sum, event) => sum + (event.reportedTokens?.output ?? 0), 0),
          total: list.reduce((sum, event) => sum + (event.reportedTokens?.total ?? 0), 0),
        },
        events: list,
      };
    },
  };
}

// Any of these headers means the request passed through a proxy/tunnel, so the
// socket peer (often 127.0.0.1 for a local reverse proxy) is NOT the real client.
const PROXY_HEADERS = ['x-forwarded-for', 'forwarded', 'x-real-ip', 'cf-connecting-ip'];

function header(request, name) {
  if (typeof request?.get === 'function') return request.get(name);
  const headers = request?.headers;
  return headers && typeof headers === 'object' ? headers[name] : undefined;
}

export function isLocalUnauthEnabled(env = process.env) {
  return String(env.ALICE_OBSERVABILITY_ALLOW_LOCAL_UNAUTH ?? '').trim() === '1';
}

export function isDirectLoopback(request) {
  // Use the actual socket address, never spoofable client-provided headers.
  if (!LOOPBACK.has(request?.socket?.remoteAddress)) return false;
  return PROXY_HEADERS.every((name) => {
    const value = header(request, name);
    return value === undefined || value === null;
  });
}

export function canReadLocalObservability(request, env = process.env) {
  // Token-free loopback access is OFF by default and must be enabled explicitly.
  if (isLocalUnauthEnabled(env) && isDirectLoopback(request)) return true;
  const expected = env.ALICE_OBSERVABILITY_READ_TOKEN;
  if (typeof expected !== 'string' || expected.length < 24) return false;
  const authorization = header(request, 'authorization');
  if (typeof authorization !== 'string' || !authorization.startsWith('Bearer ')) return false;
  const supplied = authorization.slice(7);
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(supplied, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}
