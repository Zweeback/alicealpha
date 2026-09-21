import { createPerformancePlan } from './performance.js';
import { AlicePersona } from './persona.js';
import { BrowserModelRuntime, browserAIAvailable } from './browserModel.js';

export class PersonaRuntime {
  constructor(memory, endpoint = globalThis.__ALICE_BACKEND__ || null) {
    this.local = new AlicePersona(memory);
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
    if (this.endpoint) {
      try {
        const response = await fetch(this.endpoint, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            text,
            confirmed_memory: this.local.memory.recent(8),
            persona_state: this.local.state,
          }),
          signal,
        });
        if (response.ok) {
          const result = await response.json();
          if (result?.reply && result?.plan) return { ...result, source: 'cloud' };
        }
      } catch {
        // The embodied experience remains available when the cloud adapter is absent.
      }
    }

    const localFrame = await this.local.respond(text);

    if (
      this.browserModel.ready
      && !localFrame.candidate
      && !['memory', 'boundary'].includes(localFrame.dialogueAct)
    ) {
      try {
        const reply = await this.browserModel.reply(text, {
          memory: this.local.memory.recent(8),
          state: localFrame.state,
        });
        return {
          ...localFrame,
          reply,
          plan: createPerformancePlan(reply, localFrame.state, localFrame.dialogueAct),
          source: 'browser',
        };
      } catch {
        // Fall through to the deterministic local persona if browser inference fails.
      }
    }

    return { ...localFrame, source: 'local' };
  }
}
