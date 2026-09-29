import { ALICE_REALTIME_INSTRUCTIONS } from './alicePrompt.js';

const DEFAULT_CHAIN = 'gemini:gemini-2.5-flash,groq:llama-3.3-70b-versatile,openrouter:google/gemini-2.5-flash:free';
const CIRCUIT_COOLDOWN_MS = 60_000;
const circuitBreakers = new Map();

const PROVIDERS = Object.freeze({
  gemini: {
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    key: 'GEMINI_API_KEY',
    defaultModel: 'gemini-2.5-flash',
  },
  groq: {
    endpoint: 'https://api.groq.com/openai/v1/chat/completions',
    key: 'GROQ_API_KEY',
    defaultModel: 'llama-3.3-70b-versatile',
  },
  openrouter: {
    endpoint: 'https://openrouter.ai/api/v1/chat/completions',
    key: 'OPENROUTER_API_KEY',
    defaultModel: 'google/gemini-2.5-flash:free',
  },
  openai: {
    endpoint: 'https://api.openai.com/v1/chat/completions',
    key: 'OPENAI_API_KEY',
    defaultModel: 'gpt-4o-mini',
  },
});

export function parseLlmChain(value = process.env.ALICE_LLM_CHAIN || DEFAULT_CHAIN) {
  if (!value) return [];
  return String(value)
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [providerName, ...modelParts] = entry.split(':');
      const provider = providerName.toLowerCase();
      const config = PROVIDERS[provider];
      if (!config) return null;
      return {
        provider,
        model: modelParts.join(':') || config.defaultModel,
      };
    })
    .filter(Boolean);
}

function breakerKey(provider, model) {
  return `${provider}:${model || ''}`;
}

export function isCircuitOpen(provider, model = '') {
  const key = breakerKey(provider, model);
  const failedAt = circuitBreakers.get(key);
  if (!failedAt) return false;
  if (Date.now() - failedAt >= CIRCUIT_COOLDOWN_MS) {
    circuitBreakers.delete(key);
    return false;
  }
  return true;
}

export function tripCircuit(provider, model = '') {
  circuitBreakers.set(breakerKey(provider, model), Date.now());
}

export function resetCircuits() {
  circuitBreakers.clear();
}

export function getAvailableProviders(env = process.env) {
  return parseLlmChain(env.ALICE_LLM_CHAIN).filter(({ provider, model }) => {
    const config = PROVIDERS[provider];
    return Boolean(config && env[config.key] && !isCircuitOpen(provider, model));
  });
}

function compactMemory(memory = []) {
  if (!Array.isArray(memory)) return '';
  return memory
    .slice(-8)
    .map((item) => item?.value ?? item)
    .filter(Boolean)
    .map((value) => `- ${String(value).slice(0, 360)}`)
    .join('\n');
}

export function buildChatSystemPrompt({
  confirmed_memory = [],
  persona_state = null,
  companion_state = null,
} = {}) {
  const memory = compactMemory(confirmed_memory);
  const additions = [
    '',
    'TEXT-/VOICE-GATEWAY',
    '- In diesem Gateway stehen keine Modell-Tools zur Verfügung. Antworte ausschließlich mit normalem Antworttext.',
    '- Avatar-Animation, Gedächtnisbestätigung und Persistenz bleiben lokale, deterministische App-Aufgaben.',
    '- Behaupte keine Tool-Ausführung, keinen Dateizugriff und keine dauerhafte Speicherung.',
    memory ? `BESTÄTIGTE ERINNERUNGEN:\n${memory}` : '',
    companion_state
      ? `KONTINUITÄT: Sitzung ${Number(companion_state.sessionCount || 0)}, Turns ${Number(companion_state.turnCount || 0)}.`
      : '',
    persona_state
      ? `PERSONA-STATUS: Wärme ${Number(persona_state.warmth || 0.6).toFixed(2)}, Neugier ${Number(persona_state.curiosity || 0.5).toFixed(2)}.`
      : '',
  ].filter(Boolean);

  return [ALICE_REALTIME_INSTRUCTIONS, ...additions].join('\n');
}

function providerHeaders(provider, apiKey) {
  return {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    ...(provider === 'openrouter'
      ? {
          'HTTP-Referer': 'https://alicealpha.onrender.com',
          'X-Title': 'Alice Alpha',
        }
      : {}),
  };
}

function extractReply(payload) {
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content.trim();
  if (Array.isArray(content)) {
    return content
      .map((part) => typeof part === 'string' ? part : part?.text || '')
      .join('')
      .trim();
  }
  return '';
}

async function callProvider({
  provider,
  model,
  messages,
  env,
  fetchFn,
  timeoutMs,
}) {
  const config = PROVIDERS[provider];
  const apiKey = config ? env[config.key] : null;
  if (!config || !apiKey) throw new Error(`llm-provider-unavailable:${provider}`);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchFn(config.endpoint, {
      method: 'POST',
      headers: providerHeaders(provider, apiKey),
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.65,
        max_tokens: 240,
        stream: false,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const error = new Error(`llm-provider-http:${provider}:${response.status}`);
      error.status = response.status;
      throw error;
    }

    const payload = await response.json();
    const reply = extractReply(payload);
    if (!reply) throw new Error(`llm-provider-empty:${provider}`);
    return reply;
  } finally {
    clearTimeout(timer);
  }
}

export async function completeLlmChat({
  text,
  messages,
  confirmed_memory,
  persona_state,
  companion_state,
}, {
  env = process.env,
  fetchFn = globalThis.fetch,
  timeoutMs = Number(env.ALICE_LLM_TIMEOUT_MS || 8_000),
} = {}) {
  const clean = typeof text === 'string' ? text.trim() : '';
  const conversation = Array.isArray(messages) && messages.length
    ? messages
        .filter((message) => ['user', 'assistant'].includes(message?.role) && typeof message?.content === 'string')
        .slice(-12)
        .map((message) => ({ role: message.role, content: message.content.slice(0, 6_000) }))
    : clean
      ? [{ role: 'user', content: clean.slice(0, 6_000) }]
      : [];

  if (!conversation.length) throw new Error('llm-chat-input-required');
  if (typeof fetchFn !== 'function') throw new Error('llm-fetch-unavailable');

  const system = buildChatSystemPrompt({ confirmed_memory, persona_state, companion_state });
  const fullMessages = [{ role: 'system', content: system }, ...conversation];
  let lastError = null;

  for (const candidate of parseLlmChain(env.ALICE_LLM_CHAIN)) {
    const config = PROVIDERS[candidate.provider];
    if (!config || !env[config.key] || isCircuitOpen(candidate.provider, candidate.model)) continue;

    try {
      const reply = await callProvider({
        ...candidate,
        messages: fullMessages,
        env,
        fetchFn,
        timeoutMs,
      });
      return {
        reply,
        provider: candidate.provider,
        model: candidate.model,
        source: `llm-router:${candidate.provider}`,
      };
    } catch (error) {
      lastError = error;
      const status = Number(error?.status || 0);
      if (error?.name === 'AbortError' || status === 429 || status >= 500) {
        tripCircuit(candidate.provider, candidate.model);
      }
    }
  }

  throw lastError || new Error('llm-router-no-provider');
}

export const aliceLlmRouter = Object.freeze({
  defaultChain: DEFAULT_CHAIN,
  providers: Object.keys(PROVIDERS),
});
