export const WEBLLM_MODULE_URL = 'https://esm.run/@mlc-ai/web-llm';
export const BROWSER_MODEL_ID = 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC';

export function browserAIAvailable(scope = globalThis) {
  return Boolean(scope?.navigator?.gpu);
}

function compactMemory(memory = []) {
  return memory
    .slice(-6)
    .map((item) => item?.value)
    .filter(Boolean)
    .map((value) => `- ${String(value).slice(0, 240)}`)
    .join('\n');
}

export class BrowserModelRuntime {
  constructor() {
    this.engine = null;
    this.loading = null;
  }

  get ready() {
    return Boolean(this.engine);
  }

  async load(onProgress = () => {}) {
    if (this.engine) return this.engine;
    if (this.loading) return this.loading;
    if (!browserAIAvailable()) throw new Error('webgpu-unavailable');

    this.loading = (async () => {
      const webllm = await import(/* @vite-ignore */ WEBLLM_MODULE_URL);
      const engine = await webllm.CreateMLCEngine(BROWSER_MODEL_ID, {
        initProgressCallback: (progress) => onProgress(progress),
      });
      this.engine = engine;
      return engine;
    })();

    try {
      return await this.loading;
    } finally {
      this.loading = null;
    }
  }

  async reply(text, { memory = [], state = {}, companion = null } = {}) {
    if (!this.engine) throw new Error('browser-model-not-loaded');

    const memoryBlock = compactMemory(memory);
    const response = await this.engine.chat.completions.create({
      messages: [
        {
          role: 'system',
          content: [
            'Du bist Alice, eine deutschsprachige KI-Begleiterin.',
            'Antworte natürlich, präzise, warm und knapp. Erfinde keine Erinnerungen oder Fakten.',
            'Wenn Wissen fehlt, sage das klar. Behaupte nie, ein Mensch zu sein.',
            'Persistente Erinnerungen dürfen nicht eigenmächtig geschrieben werden.',
            memoryBlock ? `Bestätigte Erinnerungen:\n${memoryBlock}` : '',
            `Aktueller Stilzustand: Wärme ${Number(state.warmth || 0.6).toFixed(2)}, Neugier ${Number(state.curiosity || 0.5).toFixed(2)}.`,
            companion ? `Kontinuität auf diesem Gerät: Sitzung ${Number(companion.sessionCount || 0)}, bisherige Turns ${Number(companion.turnCount || 0)}. Nutze das beiläufig und niemals schuld- oder druckerzeugend.` : '',
          ].filter(Boolean).join('\n'),
        },
        { role: 'user', content: String(text) },
      ],
      temperature: 0.65,
      max_tokens: 180,
    });

    const reply = response?.choices?.[0]?.message?.content?.trim();
    if (!reply) throw new Error('browser-model-empty');
    return reply;
  }
}
