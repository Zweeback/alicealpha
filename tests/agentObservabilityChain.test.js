import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildAgentGeneration,
  createAgentObservabilityReporter,
} from '../server/agentObservability.js';
import { createChatTelemetry } from '../server/chatTelemetry.js';
import {
  buildChatTrace,
  createOtlpTraceExporter,
  isOtlpTracesConfigured,
  otlpTracesUrl,
  parseOtlpHeaders,
} from '../server/otlpTraces.js';
import { completeLlmChat, resetCircuits } from '../server/llmRouter.js';

const AO_ENV = {
  AGENTO11Y_ENDPOINT: 'https://agento11y-prod-eu-west-2.grafana.net',
  AGENTO11Y_AUTH_TENANT_ID: '111111',
  AGENTO11Y_AUTH_TOKEN: 'dummy-ao-secret-not-real',
};
// Test-only placeholder built at runtime; not a credential.
const FAKE_BASIC = Buffer.from(['otlp-test-user', 'otlp-test-pass'].join(':')).toString('base64');
const OTLP_ENV = {
  OTEL_EXPORTER_OTLP_ENDPOINT: 'https://otlp-gateway-prod-eu-west-2.grafana.net/otlp',
  OTEL_EXPORTER_OTLP_HEADERS: `Authorization=Basic%20${FAKE_BASIC}`,
};

describe('Alice fallback chain telemetry', () => {
  beforeEach(() => resetCircuits());

  it('numbers attempts, links the fallback to the failed attempt and exports no content', async () => {
    const generations = [];
    const traces = [];
    const telemetry = createChatTelemetry({
      reportGeneration: async (attempt) => { generations.push(attempt); },
      exportTrace: async (trace) => { traces.push(trace); },
    });
    const fetchFn = vi.fn(async (url) => {
      if (String(url).includes('groq')) return { ok: false, status: 503 };
      return { ok: true, json: async () => ({
        model: 'gemini-2.5-flash-001',
        choices: [{ message: { content: 'PRIVATE ANSWER' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 4, total_tokens: 14 },
      }) };
    });
    await completeLlmChat({ text: 'PRIVATE PROMPT' }, {
      env: {
        ALICE_LLM_CHAIN: 'groq:llama-3.3-70b-versatile,gemini:gemini-2.5-flash',
        GROQ_API_KEY: 'private-groq-key',
        GEMINI_API_KEY: 'private-gemini-key',
      },
      fetchFn,
      onAttempt: telemetry.onAttempt,
    });
    telemetry.finish('success');
    await Promise.resolve();

    expect(generations).toHaveLength(2);
    const [failed, success] = generations;
    expect(failed).toMatchObject({ attempt: 1, outcome: 'error', errorType: 'http_503', parentGenerationIds: [] });
    expect(success).toMatchObject({
      attempt: 2,
      outcome: 'success',
      responseModel: 'gemini-2.5-flash-001',
      stopReason: 'stop',
      parentGenerationIds: [failed.generationId],
    });
    expect(success.conversationId).toBe(failed.conversationId);
    expect(success.traceId).toMatch(/^[0-9a-f]{32}$/);

    const exported = buildAgentGeneration(success, {
      conversationId: success.conversationId,
      generationId: success.generationId,
      parentGenerationIds: success.parentGenerationIds,
      traceId: success.traceId,
      spanId: success.spanId,
    });
    expect(exported).toMatchObject({
      tags: { 'alice.attempt': '2', 'alice.fallback': 'true', 'alice.outcome': 'success' },
      parent_generation_ids: [failed.generationId],
      response_model: 'gemini-2.5-flash-001',
      stop_reason: 'stop',
      trace_id: success.traceId,
      span_id: success.spanId,
    });

    expect(traces).toHaveLength(1);
    const otlp = buildChatTrace(traces[0]);
    const spans = otlp.resourceSpans[0].scopeSpans[0].spans;
    expect(spans).toHaveLength(3);
    expect(spans[1].parentSpanId).toBe(spans[0].spanId);
    expect(spans[1].status.code).toBe(2);
    expect(spans[2].status.code).toBe(1);
    const all = JSON.stringify([generations, exported, otlp]);
    expect(all).not.toMatch(/PRIVATE|private-|API_KEY|Bearer/);
  });

  it('drops free-text model labels, unknown stop reasons and malformed ids', () => {
    const generation = buildAgentGeneration({
      provider: 'openrouter', model: 'x', outcome: 'success', attempt: 99,
      startedAt: '2026-11-17T06:00:00Z', completedAt: '2026-11-17T06:00:01Z',
      responseModel: 'Hello Benjamin, here is your secret', stopReason: 'user said hi',
    }, { conversationId: 'c-12345678', generationId: 'g-12345678', parentGenerationIds: ['bad id!'], traceId: 'nothex', spanId: '123' });
    expect(generation).not.toHaveProperty('response_model');
    expect(generation).not.toHaveProperty('stop_reason');
    expect(generation).not.toHaveProperty('parent_generation_ids');
    expect(generation).not.toHaveProperty('trace_id');
    expect(generation.tags).not.toHaveProperty('alice.attempt');
  });
});

describe('Agent Observability delivery status', () => {
  const attempt = {
    provider: 'gemini', model: 'gemini-2.5-flash', outcome: 'success', attempt: 1,
    startedAt: '2026-11-17T06:00:00Z', completedAt: '2026-11-17T06:00:01Z',
  };

  it('counts accepted ingest answers without claiming Grafana visibility', async () => {
    const fetchFn = vi.fn(async (_url, options) => {
      const id = JSON.parse(options.body).generations[0].id;
      return { ok: true, status: 200, json: async () => ({ results: [{ generation_id: id, accepted: true }] }) };
    });
    const report = createAgentObservabilityReporter({ env: AO_ENV, fetchFn });
    expect(report.status.delivery).toBe('unverified');
    expect(await report(attempt)).toBe(true);
    expect(report.status).toMatchObject({ delivery: 'ingest-accepted', exportsAttempted: 1, exportsAccepted: 1, lastHttpStatus: 200 });
    expect(JSON.stringify(report.status)).not.toContain('dummy-ao-secret');
  });

  it('records 401 rejections and transport errors as non-delivery', async () => {
    const rejected = createAgentObservabilityReporter({ env: AO_ENV, fetchFn: async () => ({ ok: false, status: 401 }) });
    expect(await rejected(attempt)).toBe(false);
    expect(rejected.status).toMatchObject({ delivery: 'ingest-rejected', exportsFailed: 1, lastHttpStatus: 401 });

    const broken = createAgentObservabilityReporter({ env: AO_ENV, fetchFn: async () => { throw new Error('dummy-ao-secret-not-real'); } });
    expect(await broken(attempt)).toBe(false);
    expect(broken.status.delivery).toBe('ingest-error');
    expect(JSON.stringify(broken.status)).not.toContain('dummy-ao-secret');
  });
});

describe('OTLP trace channel (separate from Agent Observability)', () => {
  it('needs an https endpoint and an Authorization header', () => {
    expect(isOtlpTracesConfigured({})).toBe(false);
    expect(isOtlpTracesConfigured({ OTEL_EXPORTER_OTLP_ENDPOINT: OTLP_ENV.OTEL_EXPORTER_OTLP_ENDPOINT })).toBe(false);
    expect(isOtlpTracesConfigured({ ...OTLP_ENV, OTEL_EXPORTER_OTLP_ENDPOINT: 'http://insecure.example/otlp' })).toBe(false);
    expect(isOtlpTracesConfigured({ ...OTLP_ENV, ALICE_OTLP_TRACES: 'off' })).toBe(false);
    expect(isOtlpTracesConfigured(OTLP_ENV)).toBe(true);
    expect(otlpTracesUrl(OTLP_ENV)).toBe('https://otlp-gateway-prod-eu-west-2.grafana.net/otlp/v1/traces');
    expect(parseOtlpHeaders(OTLP_ENV.OTEL_EXPORTER_OTLP_HEADERS)).toEqual({ Authorization: `Basic ${FAKE_BASIC}` });
  });

  it('posts OTLP JSON with GenAI attributes and tracks ingest status', async () => {
    const fetchFn = vi.fn(async () => ({ ok: true, status: 200 }));
    const exportTrace = createOtlpTraceExporter({ env: OTLP_ENV, fetchFn });
    const ok = await exportTrace({
      traceId: 'a'.repeat(32), rootSpanId: 'b'.repeat(16),
      startedAt: '2026-11-17T06:00:00Z', completedAt: '2026-11-17T06:00:02Z', outcome: 'success',
      attempts: [{
        provider: 'gemini', model: 'gemini-2.5-flash', outcome: 'success', attempt: 1, spanId: 'c'.repeat(16),
        startedAt: '2026-11-17T06:00:00Z', completedAt: '2026-11-17T06:00:01Z',
        usage: { input_tokens: 3, output_tokens: 2 },
      }],
    });
    expect(ok).toBe(true);
    const [url, options] = fetchFn.mock.calls[0];
    expect(url).toBe('https://otlp-gateway-prod-eu-west-2.grafana.net/otlp/v1/traces');
    expect(options.headers.Authorization).toBe(`Basic ${FAKE_BASIC}`);
    const body = JSON.parse(options.body);
    const child = body.resourceSpans[0].scopeSpans[0].spans[1];
    const attrs = Object.fromEntries(child.attributes.map((a) => [a.key, Object.values(a.value)[0]]));
    expect(attrs).toMatchObject({
      'gen_ai.operation.name': 'chat',
      'gen_ai.provider.name': 'gemini',
      'gen_ai.request.model': 'gemini-2.5-flash',
      'gen_ai.usage.input_tokens': '3',
      'gen_ai.usage.output_tokens': '2',
    });
    expect(child.startTimeUnixNano).toBe('1794895200000000000');
    expect(exportTrace.status).toMatchObject({ configured: true, delivery: 'ingest-accepted', exportsAccepted: 1 });
  });
});

describe('committed Grafana configuration templates', () => {
  it('ships an importable dashboard without secrets or hardcoded datasource ids', () => {
    const raw = readFileSync('grafana/alice-agent-observability.dashboard.json', 'utf8');
    const dashboard = JSON.parse(raw);
    expect(dashboard.uid).toBe('alice-agent-o11y');
    expect(dashboard.panels.length).toBeGreaterThanOrEqual(5);
    expect(raw).not.toMatch(/glc_|Basic [A-Za-z0-9+/=]{8,}|AGENTO11Y_AUTH_TOKEN=/);
    for (const panel of dashboard.panels.filter((p) => p.datasource)) {
      expect(panel.datasource.uid).toMatch(/^\$\{(tempo|health)\}$/);
    }
  });

  it('keeps every credential variable empty in .env.example', () => {
    const env = readFileSync('.env.example', 'utf8');
    for (const name of ['AGENTO11Y_AUTH_TOKEN', 'AGENTO11Y_AUTH_TENANT_ID', 'OTEL_EXPORTER_OTLP_HEADERS']) {
      expect(env).toMatch(new RegExp('^' + name + '=$', 'm'));
    }
    expect(env).toMatch(/^OTEL_EXPORTER_OTLP_ENDPOINT=https:\/\/otlp-gateway-prod-eu-west-2\.grafana\.net\/otlp$/m);
  });
});
