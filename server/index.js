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

app.get('/api/health', (_request, response) => {
  const kernel = buildAliceKernelSnapshot(process.env);
  response.json({
    ok: true,
    identity: kernel.identity,
    kernel: kernel.kernel,
    controlPlane: kernel.control_plane,
    capabilities: kernel.capability_registry.summary,
    mcp: true,
    mcpEndpoint: '/mcp',
    realtime: Boolean(process.env.OPENAI_API_KEY),
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

app.post('/api/realtime/session', express.text({ type: ['application/sdp', 'text/plain'], limit: '1mb' }), async (request, response) => {
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
    response.status(upstream.status);
    response.type(upstream.headers.get('content-type') || 'application/sdp');
    response.send(payload);
  } catch (error) {
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
