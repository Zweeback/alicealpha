import express from 'express';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { ALICE_REALTIME_INSTRUCTIONS, ALICE_TOOLS } from './alicePrompt.js';

try {
  if (existsSync('.env.local')) process.loadEnvFile('.env.local');
} catch {
  // Production hosts normally inject variables directly.
}

const app = express();
const port = Number(process.env.PORT || 8787);
const dist = resolve('dist');

app.disable('x-powered-by');
app.get('/api/health', (_request, response) => {
  response.json({
    ok: true,
    realtime: Boolean(process.env.OPENAI_API_KEY),
    model: process.env.OPENAI_REALTIME_MODEL || 'gpt-realtime-2.1',
  });
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

  const session = {
    type: 'realtime',
    model: process.env.OPENAI_REALTIME_MODEL || 'gpt-realtime-2.1',
    instructions: ALICE_REALTIME_INSTRUCTIONS,
    tools: ALICE_TOOLS,
    tool_choice: 'auto',
    audio: {
      input: {
        transcription: {
          model: 'gpt-live-transcribe',
          languages: ['de'],
          delay: 'low',
        },
        turn_detection: {
          type: 'semantic_vad',
          eagerness: 'medium',
          create_response: true,
          interrupt_response: true,
        },
      },
      output: { voice: process.env.OPENAI_REALTIME_VOICE || 'marin' },
    },
  };

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
});
