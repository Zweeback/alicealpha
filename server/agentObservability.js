import { randomUUID } from 'node:crypto';

const EXPORT_PATH = '/api/v1/generations:export';
const AGENT_NAME = 'alice-alpha-chat';
const AGENT_VERSION = '0.3.0';

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

export function buildAgentGeneration(attempt, {
  conversationId = randomUUID(),
  generationId = randomUUID(),
  agentVersion = AGENT_VERSION,
} = {}) {
  if (!attempt?.provider || !attempt?.model || !attempt?.startedAt || !attempt?.completedAt) {
    throw new TypeError('alice-generation-metadata-required');
  }
  // Explicit allowlist: do not export prompt, answer, memory, URL, user ID, token or raw exception.
  const errorType = String(attempt.errorType || '');
  const safeError = /^(?:http_[1-5][0-9]{2}|timeout|transport|empty_response|provider_error)$/.test(errorType)
    ? errorType
    : 'provider_error';
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
    tags: {
      'alice.route': '/api/chat',
      'alice.outcome': attempt.outcome === 'success' ? 'success' : 'error',
    },
    ...(attempt.outcome === 'success' ? {} : { call_error: 'alice_' + safeError }),
    ...(safeUsage(attempt.usage) ? { usage: safeUsage(attempt.usage) } : {}),
  };
}

export function createAgentObservabilityReporter({
  env = process.env,
  fetchFn = globalThis.fetch,
} = {}) {
  if (!isAgentObservabilityConfigured(env) || typeof fetchFn !== 'function') {
    return async () => false;
  }

  const endpoint = exportUrl(env.AGENTO11Y_ENDPOINT);
  const auth = 'Basic ' + Buffer.from(env.AGENTO11Y_AUTH_TENANT_ID + ':' + env.AGENTO11Y_AUTH_TOKEN).toString('base64');
  const timeoutMs = Math.min(15000, Math.max(1000, Number(env.AGENTO11Y_EXPORT_TIMEOUT_MS) || 3000));

  return async (attempt) => {
    try {
      const generation = buildAgentGeneration(attempt, {
        conversationId: attempt.conversationId,
        generationId: attempt.generationId,
        agentVersion: env.AGENTO11Y_AGENT_VERSION || AGENT_VERSION,
      });
      const response = await fetchFn(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: auth },
        body: JSON.stringify({ generations: [generation] }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) return false;
      const data = await response.json();
      return Array.isArray(data?.results)
        && data.results.some((item) => (
          item.accepted === true &&
          (item.generation_id === generation.id || item.generationId === generation.id)
        ));
    } catch {
      // Observability is best effort. Never leak credentials or disturb a model call.
      return false;
    }
  };
}
