import { randomUUID } from 'node:crypto';

const EXPORT_PATH = '/api/v1/generations:export';
export const AGENT_NAME = 'alice-alpha-chat';
export const AGENT_VERSION = '0.3.0';

const ID_PATTERN = /^[A-Za-z0-9-]{8,64}$/;
const TRACE_ID_PATTERN = /^[0-9a-f]{32}$/;
const SPAN_ID_PATTERN = /^[0-9a-f]{16}$/;
const SAFE_LABEL_PATTERN = /^[A-Za-z0-9._:/@-]{1,128}$/;
const SAFE_ERRORS = /^(?:http_[1-5][0-9]{2}|timeout|transport|empty_response|provider_error)$/;
const STOP_REASONS = new Set(['stop', 'length', 'content_filter', 'tool_calls', 'function_call', 'end_turn', 'max_tokens']);

export function isAgentObservabilityConfigured(env = process.env) {
  if (!env.AGENTO11Y_ENDPOINT || !env.AGENTO11Y_AUTH_TENANT_ID || !env.AGENTO11Y_AUTH_TOKEN) {
    return false;
  }
  try {
    const url = new URL(env.AGENTO11Y_ENDPOINT);
    return url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash;
  } catch {
    return false;
  }
}

function exportUrl(endpoint) {
  const url = new URL(endpoint);
  url.pathname = url.pathname.replace(/\/+$/, '').replace(/\/api\/v1\/generations:export$/, '');
  url.pathname = url.pathname.replace(/\/+$/, '') + EXPORT_PATH;
  return url.toString();
}

function usageField(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : 0;
}

function safeUsage(value) {
  if (!value || typeof value !== 'object') return undefined;
  // Token counts are provider-reported. Missing usage is not zero usage.
  if (!['input_tokens', 'output_tokens', 'total_tokens'].some((key) => value[key] !== undefined)) {
    return undefined;
  }
  return {
    input_tokens: usageField(value.input_tokens),
    output_tokens: usageField(value.output_tokens),
    total_tokens: usageField(value.total_tokens),
  };
}

function safeAttemptNumber(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 1 && number <= 32 ? number : undefined;
}

export function buildAgentGeneration(attempt, {
  conversationId = randomUUID(),
  generationId = randomUUID(),
  agentVersion = AGENT_VERSION,
  parentGenerationIds = [],
  traceId,
  spanId,
} = {}) {
  if (!attempt?.provider || !attempt?.model || !attempt?.startedAt || !attempt?.completedAt) {
    throw new TypeError('alice-generation-metadata-required');
  }
  // Explicit allowlist: do not export prompt, answer, memory, URL, user ID, token or raw exception.
  const errorType = String(attempt.errorType || '');
  const safeError = SAFE_ERRORS.test(errorType) ? errorType : 'provider_error';
  const attemptNumber = safeAttemptNumber(attempt.attempt);
  const parents = (Array.isArray(parentGenerationIds) ? parentGenerationIds : [])
    .filter((id) => typeof id === 'string' && ID_PATTERN.test(id))
    .slice(0, 8);
  const responseModel = typeof attempt.responseModel === 'string' && SAFE_LABEL_PATTERN.test(attempt.responseModel)
    ? attempt.responseModel
    : undefined;
  const stopReason = STOP_REASONS.has(attempt.stopReason) ? attempt.stopReason : undefined;
  const tags = {
    'alice.route': '/api/chat',
    'alice.outcome': attempt.outcome === 'success' ? 'success' : 'error',
  };
  if (attemptNumber) {
    tags['alice.attempt'] = String(attemptNumber);
    tags['alice.fallback'] = attemptNumber > 1 ? 'true' : 'false';
  }
  return {
    id: generationId,
    conversation_id: conversationId,
    operation_name: 'chat',
    mode: 'GENERATION_MODE_SYNC',
    model: { provider: String(attempt.provider), name: String(attempt.model) },
    started_at: new Date(attempt.startedAt).toISOString(),
    completed_at: new Date(attempt.completedAt).toISOString(),
    agent_name: AGENT_NAME,
    agent_version: agentVersion,
    tags,
    ...(attempt.outcome === 'success' ? {} : { call_error: 'alice_' + safeError }),
    ...(safeUsage(attempt.usage) ? { usage: safeUsage(attempt.usage) } : {}),
    ...(responseModel ? { response_model: responseModel } : {}),
    ...(stopReason ? { stop_reason: stopReason } : {}),
    ...(parents.length ? { parent_generation_ids: parents } : {}),
    ...(typeof traceId === 'string' && TRACE_ID_PATTERN.test(traceId) ? { trace_id: traceId } : {}),
    ...(typeof spanId === 'string' && SPAN_ID_PATTERN.test(spanId) ? { span_id: spanId } : {}),
  };
}

/**
 * Process-local delivery counters. They describe what the ingest API answered,
 * never what Grafana displays: "ingest-accepted" is not "observed in Grafana".
 */
export function createDeliveryStatus() {
  return {
    delivery: 'unverified',
    exportsAttempted: 0,
    exportsAccepted: 0,
    exportsFailed: 0,
    lastHttpStatus: null,
    lastAcceptedAt: null,
    lastFailureAt: null,
  };
}

function markFailure(status, httpStatus) {
  status.exportsFailed += 1;
  status.lastHttpStatus = httpStatus;
  status.lastFailureAt = new Date().toISOString();
  if (status.exportsAccepted === 0) {
    status.delivery = httpStatus ? 'ingest-rejected' : 'ingest-error';
  }
}

export function createAgentObservabilityReporter({
  env = process.env,
  fetchFn = globalThis.fetch,
  status = createDeliveryStatus(),
} = {}) {
  if (!isAgentObservabilityConfigured(env) || typeof fetchFn !== 'function') {
    const disabled = async () => false;
    disabled.status = status;
    return disabled;
  }

  const endpoint = exportUrl(env.AGENTO11Y_ENDPOINT);
  const auth = 'Basic ' + Buffer.from(env.AGENTO11Y_AUTH_TENANT_ID + ':' + env.AGENTO11Y_AUTH_TOKEN).toString('base64');
  const timeoutMs = Math.min(15000, Math.max(1000, Number(env.AGENTO11Y_EXPORT_TIMEOUT_MS) || 3000));

  const report = async (attempt) => {
    let generation;
    try {
      generation = buildAgentGeneration(attempt, {
        conversationId: attempt.conversationId,
        generationId: attempt.generationId,
        agentVersion: env.AGENTO11Y_AGENT_VERSION || AGENT_VERSION,
        parentGenerationIds: attempt.parentGenerationIds,
        traceId: attempt.traceId,
        spanId: attempt.spanId,
      });
    } catch {
      return false;
    }
    status.exportsAttempted += 1;
    try {
      const response = await fetchFn(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: auth },
        body: JSON.stringify({ generations: [generation] }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) {
        markFailure(status, Number(response.status) || null);
        return false;
      }
      const data = await response.json();
      const accepted = Array.isArray(data?.results)
        && data.results.some((item) => (
          item.accepted === true &&
          (item.generation_id === generation.id || item.generationId === generation.id)
        ));
      if (!accepted) {
        markFailure(status, Number(response.status) || null);
        return false;
      }
      status.exportsAccepted += 1;
      status.lastHttpStatus = Number(response.status) || 200;
      status.lastAcceptedAt = new Date().toISOString();
      status.delivery = 'ingest-accepted';
      return true;
    } catch {
      // Observability is best effort. Never leak credentials or disturb a model call.
      markFailure(status, null);
      return false;
    }
  };
  report.status = status;
  return report;
}
