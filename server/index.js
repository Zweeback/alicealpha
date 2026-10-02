import express from 'express';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { handleAliceMcpHttp } from './aliceMcp.js';
import { buildAliceKernelSnapshot } from './capabilityRegistry.js';
import { buildRealtimeSession } from './realtimeSession.js';
import { callOllama } from './ollama.js';
import { buildScenePlan } from '../src/news/newsPipeline.js';
import { diagnosePipeline, getCompanionFailureMetadata, verifyKnownGoodVerticalSlice } from './companionReliability.js';
import { completeLlmChat, getAvailableProviders, parseLlmChain } from './llmRouter.js';
import { createDeviceGateway, createHttpDeviceExecutor } from './deviceGateway.js';

try {
  if (existsSync('.env.local')) process.loadEnvFile('.env.local');
} catch {
  // Production hosts normally inject variables directly.
}

const app = express();
const port = Number(process.env.PORT || 8787);
const dist = resolve('dist');

app.disable('x-powered-by');
app.set('trust proxy', 1);

const realtimeBuckets = new Map();
const chatBuckets = new Map();
const realtimeWindowMs = Math.max(1000, Number(process.env.ALICE_REALTIME_RATE_WINDOW_MS || 60000));
const realtimeMaxRequests = Math.max(1, Number(process.env.ALICE_REALTIME_RATE_MAX || 8));
const chatWindowMs = Math.max(1000, Number(process.env.ALICE_CHAT_RATE_WINDOW_MS || 60000));
const chatMaxRequests = Math.max(1, Number(process.env.ALICE_CHAT_RATE_MAX || 30));
const realtimeRuntime = {
  status: process.env.OPENAI_API_KEY ? 'unknown' : 'unconfigured',
  lastUpstreamStatus: null,
  checkedAt: null,
};

const deviceExecutor = createHttpDeviceExecutor({
  url: process.env.ALICE_DEVICE_BRIDGE_URL,
  token: process.env.ALICE_DEVICE_BRIDGE_TOKEN,
  timeoutMs: Number(process.env.ALICE_DEVICE_BRIDGE_TIMEOUT_MS || 10000),
});
const deviceGateway = createDeviceGateway({
  secret: process.env.ALICE_DEVICE_COMMAND_SECRET,
  enabled: process.env.ALICE_DEVICE_EXECUTION === 'enabled',
  executor: deviceExecutor,
});

function markRealtimeStatus(status, upstreamStatus = null) {
  realtimeRuntime.status = status;
  realtimeRuntime.lastUpstreamStatus = upstreamStatus;
  realtimeRuntime.checkedAt = new Date().toISOString();
}

function realtimeRateLimiter(request, response, next) {
  const now = Date.now();
  const key = request.ip || request.socket?.remoteAddress || 'unknown';
  const existing = realtimeBuckets.get(key);
  const bucket = !existing || now - existing.startedAt >= realtimeWindowMs
    ? { startedAt: now, count: 0 }
    : existing;

  bucket.count += 1;
  realtimeBuckets.set(key, bucket);

  if (bucket.count > realtimeMaxRequests) {
    const retryAfterMs = Math.max(0, realtimeWindowMs - (now - bucket.startedAt));
    response.set('Retry-After', String(Math.max(1, Math.ceil(retryAfterMs / 1000))));
    response.status(429).json({ error: 'realtime-rate-limited', retryAfterMs });
    return;
  }

  if (realtimeBuckets.size > 2048) {
    for (const [candidateKey, candidate] of realtimeBuckets) {
      if (now - candidate.startedAt >= realtimeWindowMs) realtimeBuckets.delete(candidateKey);
    }
  }

  next();
}

function chatRateLimiter(request, response, next) {
  const now = Date.now();
  const key = request.ip || request.socket?.remoteAddress || 'unknown';
  const existing = chatBuckets.get(key);
  const bucket = !existing || now - existing.startedAt >= chatWindowMs
    ? { startedAt: now, count: 0 }
    : existing;

  bucket.count += 1;
  chatBuckets.set(key, bucket);

  if (bucket.count > chatMaxRequests) {
    const retryAfterMs = Math.max(0, chatWindowMs - (now - bucket.startedAt));
    response.set('Retry-After', String(Math.max(1, Math.ceil(retryAfterMs / 1000))));
    response.status(429).json({ error: 'chat-rate-limited', retryAfterMs });
    return;
  }

  if (chatBuckets.size > 2048) {
    for (const [candidateKey, candidate] of chatBuckets) {
      if (now - candidate.startedAt >= chatWindowMs) chatBuckets.delete(candidateKey);
    }
  }

  next();
}

function originAllowed(request) {
  const origin = request.get('origin');
  if (!origin) return process.env.NODE_ENV !== 'production' && !process.env.RENDER;

  let normalizedOrigin;
  try {
    normalizedOrigin = new URL(origin).origin;
  } catch {
    return false;
  }

  const sameOrigin = `${request.protocol}://${request.get('host')}`;
  const allowedOrigins = new Set([
    sameOrigin,
    process.env.ALICE_PUBLIC_ORIGIN,
    process.env.RENDER_EXTERNAL_URL,
    'https://alicealpha.onrender.com',
    'https://app.buildy.so',
    'https://charm.ing',
    'http://127.0.0.1:8787',
    'http://127.0.0.1:8790',
    'http://127.0.0.1:8791',
    'http://localhost:8787',
  ].filter(Boolean));

  return allowedOrigins.has(normalizedOrigin);
}

app.options('/mcp', (_request, response) => {
  response.set({
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type, mcp-protocol-version',
  });
  response.status(204).end();
});

app.post('/mcp', express.json({ limit: '1mb' }), handleAliceMcpHttp);

app.get('/mcp', (_request, response) => {
  response.set({
    'Access-Control-Allow-Origin': '*',
    Allow: 'POST, OPTIONS',
    'Cache-Control': 'no-store',
  });
  response.status(405).json({
    jsonrpc: '2.0',
    error: { code: -32600, message: 'Use POST for stateless MCP requests.' },
    id: null,
  });
});

app.use((error, request, response, next) => {
  if (request.path === '/mcp' && error?.type === 'entity.parse.failed') {
    response.status(400).json({
      jsonrpc: '2.0',
      error: { code: -32700, message: 'Parse error' },
      id: null,
    });
    return;
  }
  next(error);
});

app.get('/api/health', (_request, response) => {
  const kernel = buildAliceKernelSnapshot(process.env);
  const realtimeConfigured = Boolean(process.env.OPENAI_API_KEY);
  const realtimeOperational = realtimeConfigured
    && !['quota-blocked', 'auth-failed', 'upstream-error', 'transport-error'].includes(realtimeRuntime.status);
  const availableChatProviders = getAvailableProviders(process.env);
  const configuredChatChain = parseLlmChain(process.env.ALICE_LLM_CHAIN);

  response.set('Cache-Control', 'no-store');
  response.json({
    ok: true,
    identity: kernel.identity,
    kernel: kernel.kernel,
    controlPlane: kernel.control_plane,
    capabilities: kernel.capability_registry.summary,
    mcp: true,
    mcpEndpoint: '/mcp',
    deviceGateway: deviceGateway.status(),
    realtime: realtimeOperational,
    realtimeConfigured,
    realtimeOperational,
    realtimeStatus: realtimeRuntime.status,
    realtimeLastUpstreamStatus: realtimeRuntime.lastUpstreamStatus,
    realtimeCheckedAt: realtimeRuntime.checkedAt,
    model: process.env.OPENAI_REALTIME_MODEL || 'gpt-realtime-2.1',
    ollama: Boolean(process.env.ALICE_OLLAMA_URL),
    ollamaModel: process.env.ALICE_OLLAMA_MODEL || 'mistral',
    tts: Boolean(process.env.ALICE_TTS_URL),
    ttsProvider: process.env.ALICE_TTS_PROVIDER || (process.env.ALICE_TTS_URL ? 'sidecar' : null),
    chat: {
      endpoint: '/api/chat',
      operational: availableChatProviders.length > 0,
      defaultProvider: availableChatProviders[0]?.provider || null,
      availableProviders: availableChatProviders.map(({ provider, model }) => ({ provider, model })),
      configuredChain: configuredChatChain.map(({ provider, model }) => ({
        provider,
        model,
        available: availableChatProviders.some((item) => item.provider === provider && item.model === model),
      })),
    },
    revision: kernel.revision,
    reliability: {
      schema: getCompanionFailureMetadata().schema,
      degradedModeSupported: true,
      safeMode: 'text',
    },
  });
});

app.get('/api/alice', (_request, response) => {
  response.set('Cache-Control', 'no-store');
  response.json(buildAliceKernelSnapshot(process.env));
});

app.get('/api/reliability', (_request, response) => {
  response.set('Cache-Control', 'no-store');
  response.json({
    ...getCompanionFailureMetadata(),
    known_good_vertical_slice: verifyKnownGoodVerticalSlice({
      mic: false,
      stt: false,
      agent: true,
      tts: Boolean(process.env.ALICE_TTS_URL || process.env.OPENAI_API_KEY),
      avatar: true,
    }),
    note: 'Server-only snapshot: client microphone/STT availability is verified in the browser turn trace.',
  });
});

app.post('/api/reliability/diagnose', express.json({ limit: '64kb' }), (request, response) => {
  try {
    response.set('Cache-Control', 'no-store');
    response.json(diagnosePipeline(request.body || {}));
  } catch (error) {
    response.status(400).json({
      error: error instanceof Error ? error.message : 'reliability-diagnosis-failed',
    });
  }
});


app.post('/api/device/command', express.json({ limit: '16kb' }), async (request, response) => {
  try {
    const result = await deviceGateway.handle(request.body, request.get('x-alice-signature'));
    response.set('Cache-Control', 'no-store');
    response.status(result.executed ? 200 : 202).json(result);
  } catch (error) {
    const code = error instanceof Error ? error.message : 'device-command-failed';
    const status = code === 'device-command-signature-invalid'
      ? 401
      : code === 'device-command-replay'
        ? 409
        : ['device-command-not-configured', 'device-executor-unavailable'].includes(code)
          ? 503
          : code.startsWith('device-bridge-rejected:')
            ? 502
            : 400;
    response.set('Cache-Control', 'no-store');
    response.status(status).json({ error: code });
  }
});

app.post('/api/chat', chatRateLimiter, express.json({ limit: '128kb' }), async (request, response) => {
  if (!originAllowed(request)) {
    response.status(403).json({ error: 'chat-origin-denied' });
    return;
  }

  const text = typeof request.body?.text === 'string' ? request.body.text.trim() : '';
  const messages = Array.isArray(request.body?.messages) ? request.body.messages : null;
  if (!text && !messages?.length) {
    response.status(400).json({ error: 'missing-text-or-messages' });
    return;
  }

  try {
    const result = await completeLlmChat({
      text,
      messages,
      confirmed_memory: request.body?.confirmed_memory,
      persona_state: request.body?.persona_state,
      companion_state: request.body?.companion_state,
    }, { env: process.env });

    response.set('Cache-Control', 'no-store');
    response.json(result);
  } catch (error) {
    const code = error instanceof Error ? error.message : 'chat-request-failed';
    const noProvider = code === 'llm-router-no-provider';
    console.error('Alice chat router failed:', code);
    response.status(noProvider ? 503 : 502).json({
      error: noProvider ? 'chat-no-provider' : 'chat-provider-failed',
    });
  }
});

app.post('/api/local/respond', express.json({ limit: '128kb' }), async (request, response) => {
  if (!process.env.ALICE_OLLAMA_URL) {
    response.status(503).json({ error: 'ollama-not-configured' });
    return;
  }

  const text = typeof request.body?.text === 'string' ? request.body.text.trim() : '';
  if (!text) {
    response.status(400).json({ error: 'missing-text' });
    return;
  }

  try {
    const result = await callOllama({
      text,
      confirmed_memory: request.body?.confirmed_memory,
      persona_state: request.body?.persona_state,
      companion_state: request.body?.companion_state,
      baseUrl: process.env.ALICE_OLLAMA_URL,
      model: process.env.ALICE_OLLAMA_MODEL || 'mistral',
      timeoutMs: Number(process.env.ALICE_OLLAMA_TIMEOUT_MS || 120000),
    });
    response.json({ ...result, source: 'ollama' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'ollama-request-failed';
    console.error('Local Ollama request failed:', message);
    response.status(message === 'ollama-empty-response' ? 502 : 503).json({ error: message });
  }
});

app.post('/api/news/prepare', express.json({ limit: '2mb' }), (request, response) => {
  const articles = Array.isArray(request.body?.articles)
    ? request.body.articles
    : request.body?.article
      ? [request.body.article]
      : [];

  if (!articles.length) {
    response.status(400).json({ error: 'missing-articles' });
    return;
  }

  const requested = Number(request.body?.targetChars || 420);
  const targetChars = Math.max(180, Math.min(1200, Number.isFinite(requested) ? requested : 420));
  response.set('Cache-Control', 'no-store');
  response.json(buildScenePlan(articles, { targetChars }));
});

app.post('/api/tts', express.json({ limit: '64kb' }), async (request, response) => {
  const target = process.env.ALICE_TTS_URL;
  if (!target) {
    response.status(503).json({ error: 'tts-not-configured' });
    return;
  }

  const text = typeof request.body?.text === 'string' ? request.body.text.trim() : '';
  if (!text) {
    response.status(400).json({ error: 'missing-text' });
    return;
  }

  try {
    const upstream = await fetch(target, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        text: text.slice(0, 4000),
        language: request.body?.language || process.env.ALICE_TTS_LANGUAGE || 'de',
        accent: request.body?.accent || null,
        rate: Number(request.body?.rate || 1),
        pitch: Number(request.body?.pitch || 1),
        voice_reference: process.env.ALICE_TTS_REFERENCE || null,
        provider: process.env.ALICE_TTS_PROVIDER || 'sidecar',
      }),
      signal: AbortSignal.timeout(Math.max(1000, Number(process.env.ALICE_TTS_TIMEOUT_MS || 45000))),
    });

    if (!upstream.ok) {
      const detail = await upstream.text().catch(() => '');
      response.status(502).json({ error: 'tts-upstream-failed', status: upstream.status, detail: detail.slice(0, 240) });
      return;
    }

    const audio = Buffer.from(await upstream.arrayBuffer());
    if (!audio.length) {
      response.status(502).json({ error: 'tts-empty-audio' });
      return;
    }

    response.set({
      'Cache-Control': 'no-store',
      'Content-Type': upstream.headers.get('content-type') || 'audio/wav',
      'Content-Length': String(audio.length),
    });
    response.send(audio);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'tts-request-failed';
    console.error('TTS sidecar request failed:', message);
    response.status(503).json({ error: 'tts-request-failed' });
  }
});

app.post('/api/realtime/session', realtimeRateLimiter, express.text({ type: ['application/sdp', 'text/plain'], limit: '1mb' }), async (request, response) => {
  if (!originAllowed(request)) {
    response.status(403).json({ error: 'realtime-origin-denied' });
    return;
  }
  if (!process.env.OPENAI_API_KEY) {
    response.status(503).json({ error: 'realtime-not-configured' });
    return;
  }
  if (!request.body || typeof request.body !== 'string') {
    response.status(400).json({ error: 'missing-sdp-offer' });
    return;
  }

  const session = buildRealtimeSession(process.env);

  const form = new FormData();
  form.set('sdp', request.body);
  form.set('session', JSON.stringify(session));

  try {
    const upstream = await fetch('https://api.openai.com/v1/realtime/calls', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'OpenAI-Safety-Identifier': 'alice-single-user',
      },
      body: form,
    });
    const payload = await upstream.text();

    if (upstream.ok) markRealtimeStatus('ready', upstream.status);
    else if (upstream.status === 429) markRealtimeStatus('quota-blocked', upstream.status);
    else if (upstream.status === 401 || upstream.status === 403) markRealtimeStatus('auth-failed', upstream.status);
    else if (upstream.status >= 500) markRealtimeStatus('upstream-error', upstream.status);
    else markRealtimeStatus('rejected', upstream.status);

    response.status(upstream.status);
    response.type(upstream.headers.get('content-type') || 'application/sdp');
    response.send(payload);
  } catch (error) {
    markRealtimeStatus('transport-error');
    console.error('Realtime session failed:', error instanceof Error ? error.message : 'unknown');
    response.status(502).json({ error: 'realtime-session-failed' });
  }
});

app.use(express.static(dist));
app.get('/{*path}', (_request, response) => response.sendFile(resolve(dist, 'index.html')));

app.listen(port, '0.0.0.0', () => {
  console.log(`Alice listening on http://0.0.0.0:${port}`);
  console.log(`Alice MCP available on http://0.0.0.0:${port}/mcp`);
});
