const DEFAULT_SYSTEM = [
  'Du bist Alice, eine direkte, aufmerksame synthetische Begleiterin.',
  'Antworte auf Deutsch, natürlich und eher knapp.',
  'Behaupte nicht, ein Mensch zu sein.',
  'Erfinde keine Erinnerungen. Nutze bestätigte Erinnerungen nur als Kontext.',
].join(' ');

function trimMemory(items = []) {
  return items
    .filter((item) => item?.status === 'confirmed')
    .slice(-8)
    .map((item) => String(item.value || '').trim())
    .filter(Boolean);
}

export function buildOllamaPrompt({ text, confirmed_memory = [], persona_state = {} }) {
  const memories = trimMemory(confirmed_memory);
  const state = persona_state && typeof persona_state === 'object'
    ? JSON.stringify(persona_state)
    : '{}';

  return [
    DEFAULT_SYSTEM,
    memories.length ? `Bestätigte Erinnerungen:\n- ${memories.join('\n- ')}` : '',
    `Interner Persona-Zustand: ${state}`,
    `Nutzer: ${String(text || '').trim()}`,
    'Alice:',
  ].filter(Boolean).join('\n\n');
}

export async function callOllama({
  text,
  confirmed_memory,
  persona_state,
  baseUrl,
  model = 'mistral',
  timeoutMs = 120000,
}) {
  if (!baseUrl) throw new Error('ollama-not-configured');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, '')}/api/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt: buildOllamaPrompt({ text, confirmed_memory, persona_state }),
        stream: false,
        options: {
          temperature: 0.72,
          num_ctx: 4096,
        },
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`ollama-http-${response.status}`);
    }

    const payload = await response.json();
    const reply = String(payload?.response || '').trim();
    if (!reply) throw new Error('ollama-empty-response');
    return { reply, model: payload?.model || model };
  } finally {
    clearTimeout(timeout);
  }
}
