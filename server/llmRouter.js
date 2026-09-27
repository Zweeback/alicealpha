import { ALICE_REALTIME_INSTRUCTIONS, ALICE_TOOLS } from './alicePrompt.js';

const circuitBreakers = new Map();
const CIRCUIT_COOLDOWN_MS = 60000;

export function parseLlmChain(chainStr = process.env.ALICE_LLM_CHAIN || 'gemini:gemini-2.5-flash,groq:llama-3.3-70b-versatile,openrouter:google/gemini-2.5-flash:free') {
  if (!chainStr) return [];
  return chainStr
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      const parts = item.split(':');
      const provider = parts[0].toLowerCase();
      const model = parts.slice(1).join(':') || defaultModelForProvider(provider);
      return { provider, model };
    })
    .filter((entry) => ['gemini', 'groq', 'openrouter', 'openai'].includes(entry.provider));
}

function defaultModelForProvider(provider) {
  switch (provider) {
    case 'gemini': return 'gemini-2.5-flash';
    case 'groq': return 'llama-3.3-70b-versatile';
    case 'openrouter': return 'google/gemini-2.5-flash:free';
    case 'openai': return 'gpt-4o-mini';
    default: return 'gpt-4o-mini';
  }
}

export function isCircuitOpen(provider) {
  const lastFailed = circuitBreakers.get(provider);
  if (!lastFailed) return false;
  if (Date.now() - lastFailed > CIRCUIT_COOLDOWN_MS) {
    circuitBreakers.delete(provider);
    return false;
  }
  return true;
}

export function tripCircuit(provider) {
  circuitBreakers.set(provider, Date.now());
}

export function resetCircuits() {
  circuitBreakers.clear();
}

export function getAvailableProviders(env = process.env) {
  const chain = parseLlmChain(env.ALICE_LLM_CHAIN);
  return chain.filter((item) => {
    if (isCircuitOpen(item.provider)) return false;
    if (item.provider === 'gemini') return Boolean(env.GEMINI_API_KEY);
    if (item.provider === 'groq') return Boolean(env.GROQ_API_KEY);
    if (item.provider === 'openrouter') return Boolean(env.OPENROUTER_API_KEY);
    if (item.provider === 'openai') return Boolean(env.OPENAI_API_KEY);
    return false;
  });
}

function buildProviderEndpoint(provider) {
  switch (provider) {
    case 'gemini':
      return 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
    case 'groq':
      return 'https://api.groq.com/openai/v1/chat/completions';
    case 'openrouter':
      return 'https://openrouter.ai/api/v1/chat/completions';
    case 'openai':
      return 'https://api.openai.com/v1/chat/completions';
    default:
      throw new Error(`Unsupported provider ${provider}`);
  }
}

function getProviderApiKey(provider, env = process.env) {
  switch (provider) {
    case 'gemini': return env.GEMINI_API_KEY;
    case 'groq': return env.GROQ_API_KEY;
    case 'openrouter': return env.OPENROUTER_API_KEY;
    case 'openai': return env.OPENAI_API_KEY;
    default: return null;
  }
}

export function buildSystemPrompt({ confirmed_memory = [], persona_state = null, companion_state = null } = {}) {
  let prompt = ALICE_REALTIME_INSTRUCTIONS;
  if (confirmed_memory && confirmed_memory.length > 0) {
    const memoryText = confirmed_memory.map((m) => `- ${m.value || m}`).join('\n');
    prompt += `\n\nBESTÄTIGTE ERINNERUNGEN:\n${memoryText}`;
  }
  if (companion_state) {
    prompt += `\n\nBEGLEITER-STATUS:\nSitzung: ${companion_state.sessionCount || 1}, Turns: ${companion_state.turnCount || 0}`;
  }
  return prompt;
}

export async function streamLlmChat({ text, confirmed_memory, persona_state, companion_state, messages }, onChunk, { env = process.env, timeoutMs = 4000, fetchFn = globalThis.fetch } = {}) {
  const chain = parseLlmChain(env.ALICE_LLM_CHAIN);
  const systemPrompt = buildSystemPrompt({ confirmed_memory, persona_state, companion_state });

  const inputMessages = messages || [{ role: 'user', content: text }];
  const fullMessages = [{ role: 'system', content: systemPrompt }, ...inputMessages];

  let lastError = null;

  for (const { provider, model } of chain) {
    const apiKey = getProviderApiKey(provider, env);
    if (!apiKey) continue;
    if (isCircuitOpen(provider)) continue;

    const endpoint = buildProviderEndpoint(provider);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetchFn(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          ...(provider === 'openrouter' ? { 'HTTP-Referer': 'https://alicealpha.onrender.com', 'X-Title': 'Alice Alpha' } : {}),
        },
        body: JSON.stringify({
          model,
          messages: fullMessages,
          tools: ALICE_TOOLS,
          tool_choice: 'auto',
          stream: true,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        if (response.status === 429 || response.status >= 500) {
          tripCircuit(provider);
        }
        throw new Error(`Provider ${provider} returned ${response.status}`);
      }

      clearTimeout(timer);

      if (!response.body) {
        throw new Error(`Provider ${provider} returned empty body`);
      }

      // Handle stream
      const reader = response.body.getReader ? response.body.getReader() : null;
      if (!reader) {
        // Fallback for non-streaming response body in test environments or standard node stream
        if (typeof response.text === 'function') {
          const bodyText = await response.text();
          onChunk({ text: bodyText, done: true, provider });
          return { provider, model };
        }
        throw new Error('Unsupported response body stream');
      }

      const decoder = new TextDecoder();
      let buffer = '';
      let receivedFirstToken = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith(':')) continue;
          if (trimmed === 'data: [DONE]') continue;
          if (trimmed.startsWith('data: ')) {
            const dataStr = trimmed.slice(6);
            try {
              const parsed = JSON.parse(dataStr);
              const delta = parsed.choices?.[0]?.delta;
              if (delta) {
                receivedFirstToken = true;
                onChunk({ delta, provider, model });
              }
            } catch {
              // Ignore malformed SSE chunks
            }
          }
        }
      }

      onChunk({ done: true, provider, model });
      return { provider, model };
    } catch (err) {
      clearTimeout(timer);
      lastError = err;
      tripCircuit(provider);
    }
  }

  throw lastError || new Error('No LLM provider available');
}
