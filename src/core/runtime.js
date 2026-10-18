import { createPerformancePlan } from './performance.js';
import { beginAliceBackendTrace, finishAliceBackendTrace } from '../telemetry/uiTelemetry.js';
import { AlicePersona } from './persona.js';
import { BrowserModelRuntime, browserAIAvailable } from './browserModel.js';

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
    this.companion?.recordTurn?.();
    const companionState = this.companion?.snapshot?.() || null;
    if (this.endpoint) {
      const traceId = beginAliceBackendTrace(this.endpoint, 'companion.chat');
      let traceCompleted = false;
      try {
        const response = await fetch(this.endpoint, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            ...(traceId ? { 'X-Alice-Trace-Id': traceId } : {}),
          },
          body: JSON.stringify({
            text,
            confirmed_memory: this.local.memory.recent(8),
            persona_state: this.local.state,
            companion_state: companionState,
          }),
          signal,
        });
        if (traceId) {
          finishAliceBackendTrace(traceId, {
            status: response.status,
            acknowledged: response.headers?.get?.('X-Alice-Trace-Id') === traceId,
          });
          traceCompleted = true;
        }
        if (response.ok) {
          const result = await response.json();
          if (result?.reply) {
            const reply = String(result.reply).trim();
            if (reply) {
              const localFrame = await this.local.respond(text);
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
        if (traceId && !traceCompleted) finishAliceBackendTrace(traceId, { error: 'transport-failed' });
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
          companion: companionState,
        });
        return {
          ...localFrame,
          reply,
          plan: createPerformancePlan(reply, localFrame.state, localFrame.dialogueAct),
          source: 'browser',
        };
      } catch {
        // Never present a canned persona line as a successful AI answer.
      }
    }

    if (localFrame.candidate || ['memory', 'boundary'].includes(localFrame.dialogueAct)) {
      return { ...localFrame, source: 'local-memory' };
    }
    throw new Error('no-operational-model');
  }
}
