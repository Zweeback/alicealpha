import { randomBytes } from 'node:crypto';
import { AGENT_NAME, AGENT_VERSION } from './agentObservability.js';

// Minimal OTLP/HTTP JSON trace exporter for Alice chat requests.
// Separate channel from Agent Observability generations: different endpoint,
// different instance ID (OpenTelemetry card), same token may carry traces:write.
// Spans carry routing metadata only (GenAI semantic conventions), never content.

const SAFE_LABEL = /^[A-Za-z0-9._:/@-]{1,128}$/;
const SAFE_ERROR = /^(?:http_[1-5][0-9]{2}|timeout|transport|empty_response|provider_error|no_provider)$/;

export function newTraceId() {
  return randomBytes(16).toString('hex');
}

export function newSpanId() {
  return randomBytes(8).toString('hex');
}

export function parseOtlpHeaders(value = '') {
  const headers = {};
  for (const part of String(value).split(',')) {
    const index = part.indexOf('=');
    if (index <= 0) continue;
    const key = part.slice(0, index).trim();
    let headerValue = part.slice(index + 1).trim();
    try {
      headerValue = decodeURIComponent(headerValue);
    } catch {
      // Keep raw value when it is not URL-encoded.
    }
    if (/^[A-Za-z0-9-]{1,64}$/.test(key) && headerValue) headers[key] = headerValue;
  }
  return headers;
}

export function otlpTracesUrl(env = process.env) {
  const explicit = env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT;
  const base = explicit || env.OTEL_EXPORTER_OTLP_ENDPOINT;
  if (!base) return null;
  try {
    const url = new URL(base);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) return null;
    if (!explicit) url.pathname = url.pathname.replace(/\/+$/, '') + '/v1/traces';
    return url.toString();
  } catch {
    return null;
  }
}

export function isOtlpTracesConfigured(env = process.env) {
  if (String(env.ALICE_OTLP_TRACES || '').toLowerCase() === 'off') return false;
  return Boolean(otlpTracesUrl(env) && parseOtlpHeaders(env.OTEL_EXPORTER_OTLP_HEADERS).Authorization);
}

function attr(key, value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'number') return { key, value: { intValue: String(Math.trunc(value)) } };
  if (typeof value === 'boolean') return { key, value: { boolValue: value } };
  return { key, value: { stringValue: String(value) } };
}

function nanos(iso) {
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? (BigInt(ms) * 1000000n).toString() : '0';
}

function label(value) {
  return typeof value === 'string' && SAFE_LABEL.test(value) ? value : undefined;
}

function tokenCount(value) {
  const n = Number(value);
  return Number.isSafeInteger(n) && n >= 0 ? n : undefined;
}

/**
 * Builds one OTLP trace: an invoke_agent root span for the /api/chat request
 * and one CLIENT child span per provider attempt (fallback chain visible).
 */
export function buildChatTrace({
  traceId,
  rootSpanId,
  startedAt,
  completedAt,
  outcome,
  errorType,
  attempts = [],
  agentVersion = AGENT_VERSION,
  serviceVersion,
}) {
  const rootError = outcome === 'success' ? undefined : (SAFE_ERROR.test(String(errorType)) ? errorType : 'provider_error');
  const spans = [{
    traceId,
    spanId: rootSpanId,
    name: `invoke_agent ${AGENT_NAME}`,
    kind: 2,
    startTimeUnixNano: nanos(startedAt),
    endTimeUnixNano: nanos(completedAt),
    attributes: [
      attr('gen_ai.operation.name', 'invoke_agent'),
      attr('gen_ai.agent.name', AGENT_NAME),
      attr('gen_ai.agent.version', agentVersion),
      attr('http.route', '/api/chat'),
      attr('alice.attempts', attempts.length),
      attr('error.type', rootError),
    ].filter(Boolean),
    status: { code: outcome === 'success' ? 1 : 2 },
  }];

  for (const item of attempts) {
    const failed = item.outcome !== 'success';
    const error = failed ? (SAFE_ERROR.test(String(item.errorType)) ? item.errorType : 'provider_error') : undefined;
    spans.push({
      traceId,
      spanId: item.spanId,
      parentSpanId: rootSpanId,
      name: `chat ${label(item.model) || 'unknown'}`,
      kind: 3,
      startTimeUnixNano: nanos(item.startedAt),
      endTimeUnixNano: nanos(item.completedAt),
      attributes: [
        attr('gen_ai.operation.name', 'chat'),
        attr('gen_ai.provider.name', label(item.provider)),
        attr('gen_ai.request.model', label(item.model)),
        attr('gen_ai.response.model', label(item.responseModel)),
        attr('gen_ai.usage.input_tokens', tokenCount(item.usage?.input_tokens)),
        attr('gen_ai.usage.output_tokens', tokenCount(item.usage?.output_tokens)),
        attr('gen_ai.agent.name', AGENT_NAME),
        attr('alice.attempt', tokenCount(item.attempt)),
        attr('alice.fallback', Number(item.attempt) > 1),
        attr('alice.generation_id', label(item.generationId)),
        attr('error.type', error),
      ].filter(Boolean),
      status: { code: failed ? 2 : 1 },
    });
  }

  return {
    resourceSpans: [{
      resource: {
        attributes: [
          attr('service.name', 'alice-alpha'),
          attr('service.version', label(serviceVersion) || agentVersion),
        ].filter(Boolean),
      },
      scopeSpans: [{
        scope: { name: 'alice-alpha.llm-router', version: agentVersion },
        spans,
      }],
    }],
  };
}

export function createOtlpTraceExporter({
  env = process.env,
  fetchFn = globalThis.fetch,
} = {}) {
  const status = { configured: false, delivery: 'unverified', exportsAccepted: 0, exportsFailed: 0, lastHttpStatus: null };
  if (!isOtlpTracesConfigured(env) || typeof fetchFn !== 'function') {
    const disabled = async () => false;
    disabled.status = status;
    return disabled;
  }
  status.configured = true;
  const url = otlpTracesUrl(env);
  const headers = { ...parseOtlpHeaders(env.OTEL_EXPORTER_OTLP_HEADERS), 'Content-Type': 'application/json' };
  const timeoutMs = Math.min(15000, Math.max(1000, Number(env.AGENTO11Y_EXPORT_TIMEOUT_MS) || 3000));

  const exportTrace = async (trace) => {
    try {
      const response = await fetchFn(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(buildChatTrace({ ...trace, serviceVersion: env.RENDER_GIT_COMMIT?.slice(0, 12) })),
        signal: AbortSignal.timeout(timeoutMs),
      });
      status.lastHttpStatus = Number(response.status) || null;
      if (!response.ok) {
        status.exportsFailed += 1;
        if (!status.exportsAccepted) status.delivery = 'ingest-rejected';
        return false;
      }
      status.exportsAccepted += 1;
      status.delivery = 'ingest-accepted';
      return true;
    } catch {
      status.exportsFailed += 1;
      if (!status.exportsAccepted) status.delivery = 'ingest-error';
      return false;
    }
  };
  exportTrace.status = status;
  return exportTrace;
}
