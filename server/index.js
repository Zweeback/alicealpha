import express from 'express';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { handleAliceMcpHttp } from './aliceMcp.js';
import { buildAliceKernelSnapshot } from './capabilityRegistry.js';
import { buildRealtimeSession } from './realtimeSession.js';
import { callOllama } from './ollama.js';

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
const realtimeWindowMs = Math.max(1000, Number(process.env.ALICE_REALTIME_RATE_WINDOW_MS || 60000));
const realtimeMaxRequests = Math.max(1, Number(process.env.ALICE_REALTIME_RATE_MAX || 8));
const realtimeRuntime = {
  status: process.env.OPENAI_API_KEY ? 'unknown' : 'unconfigured',
  lastUpstreamStatus: null,
  checkedAt: null,
};

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

  response.set('Cache-Control', 'no-store');
  response.json({
    ok: true,
    identity: kernel.identity,
    kernel: kernel.kernel,
    controlPlane: kernel.control_plane,
    capabilities: kernel.capability_registry.summary,
    mcp: true,
    mcpEndpoint: '/mcp',
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
    revision: kernel.revision,
  });
});

app.get('/api/alice', (_request, response) => {
  response.set('Cache-Control', 'no-store');
  response.json(buildAliceKernelSnapshot(process.env));
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

  const mode = request.query?.mode === 'studio' ? 'studio' : 'companion';
  const session = buildRealtimeSession(process.env, { mode });

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