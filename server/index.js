import express from 'express';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { handleAliceMcpHttp } from './aliceMcp.js';
import { buildAliceKernelSnapshot } from './capabilityRegistry.js';
import { buildRealtimeSession } from './realtimeSession.js';
import { callOllama } from './ollama.js';
import { createWebCaptureArtifact, fetchPublicWebPage, verifyWebIntakeBearer, WebIntakeError } from './webIntake.js';

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


app.post('/api/web/intake', express.json({ limit: '32kb' }), async (request, response) => {
  const token = process.env.ALICE_WEB_INTAKE_TOKEN;
  if (!token) {
    response.status(503).json({ error: 'web-intake-not-configured' });
    return;
  }

  if (!verifyWebIntakeBearer(request.get('authorization'), token)) {
    response.set('WWW-Authenticate', 'Bearer realm="alice-web-intake"');
    response.status(401).json({ error: 'web-intake-unauthorized' });
    return;
  }

  const url = typeof request.body?.url === 'string' ? request.body.url.trim() : '';
  if (!url) {
    response.status(400).json({ error: 'web-intake-missing-url' });
    return;
  }

  try {
    const capture = await fetchPublicWebPage(url, {
      maxBytes: Math.max(1024, Number(process.env.ALICE_WEB_INTAKE_MAX_BYTES || 524288)),
      timeoutMs: Math.max(1000, Number(process.env.ALICE_WEB_INTAKE_TIMEOUT_MS || 15000)),
      maxRedirects: Math.max(0, Number(process.env.ALICE_WEB_INTAKE_MAX_REDIRECTS || 3)),
    });
    const artifact = createWebCaptureArtifact(capture, { purpose: request.body?.purpose });

    response.set('Cache-Control', 'no-store');
    response.json({
      ok: true,
      capture,
      artifact,
      contextEligible: false,
    });
  } catch (error) {
    if (error instanceof WebIntakeError) {
      response.status(error.status).json({ error: error.code });
      return;
    }

    console.error('Web intake failed:', error instanceof Error ? error.message : 'unknown');
    response.status(500).json({ error: 'web-intake-failed' });
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
