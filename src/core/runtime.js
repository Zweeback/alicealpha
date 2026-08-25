import { AlicePersona } from './persona.js';

export class PersonaRuntime {
  constructor(memory, endpoint = globalThis.__ALICE_BACKEND__ || null) {
    this.local = new AlicePersona(memory);
    this.endpoint = endpoint;
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
    return { ...(await this.local.respond(text)), source: 'local' };
  }
}
