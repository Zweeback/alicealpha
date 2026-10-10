import { createPerformancePlan } from './performance.js';
import { AlicePersona } from './persona.js';
import { BrowserModelRuntime, browserAIAvailable } from './browserModel.js';

export function assertTurnActive(signal) {
  if (!signal?.aborted) return;
  const error = new Error('Alice turn cancelled');
  error.name = 'AbortError';
  throw error;
}

export class PersonaRuntime {
  constructor(memory, endpoint = globalThis.__ALICE_BACKEND__ || null, companion = null) {
    this.companion = companion;
    this.local = new AlicePersona(memory, companion);
    this.endpoint = endpoint;
    this.browserModel = new BrowserModelRuntime();
  }

  get browserAIReady() {
    return this.browserModel.ready;
  }

  get browserAISupported() {
    return browserAIAvailable();
  }

  async enableBrowserAI(onProgress) {
    await this.browserModel.load(onProgress);
    return true;
  }

  async respond(text, signal) {
    assertTurnActive(signal);
    this.companion?.recordTurn?.();
    const companionState = this.companion?.snapshot?.() || null;
    if (this.endpoint) {
      try {
        const response = await fetch(this.endpoint, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            text,
            confirmed_memory: this.local.memory.recent(8),
            persona_state: this.local.state,
            companion_state: companionState,
          }),
          signal,
        });
        assertTurnActive(signal);
        if (response.ok) {
          const result = await response.json();
          assertTurnActive(signal);
          if (result?.reply) {
            const reply = String(result.reply).trim();
            if (reply) {
              const localFrame = await this.local.respond(text);
              assertTurnActive(signal);
              return {
                ...localFrame,
                ...result,
                reply,
                plan: result.plan || createPerformancePlan(reply, localFrame.state, localFrame.dialogueAct),
                source: result.source || 'backend',
              };
            }
          }
        }
      } catch {
        assertTurnActive(signal);
        // Only actual provider failures use the local fallback.
      }
    }

    assertTurnActive(signal);
    const localFrame = await this.local.respond(text);
    assertTurnActive(signal);

    if (
      this.browserModel.ready
      && !localFrame.candidate
      && !['memory', 'boundary'].includes(localFrame.dialogueAct)
    ) {
      try {
        const reply = await this.browserModel.reply(text, {
          memory: this.local.memory.recent(8),
          state: localFrame.state,
          companion: companionState,
        });
        assertTurnActive(signal);
        return {
          ...localFrame,
          reply,
          plan: createPerformancePlan(reply, localFrame.state, localFrame.dialogueAct),
          source: 'browser',
        };
      } catch {
        assertTurnActive(signal);
        // Only inference errors, not cancellation, use the local persona.
      }
    }

    assertTurnActive(signal);
    return { ...localFrame, source: 'local' };
  }
}
