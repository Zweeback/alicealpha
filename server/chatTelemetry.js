import { randomUUID } from 'node:crypto';
import { newSpanId, newTraceId } from './otlpTraces.js';

/**
 * Per-request telemetry context for POST /api/chat.
 * - one conversation/trace per HTTP request (ephemeral, not a user identifier)
 * - one generation + span per provider attempt
 * - a fallback attempt references the previous failed attempt via parent_generation_ids
 */
export function createChatTelemetry({ reportGeneration, exportTrace, now = () => new Date() } = {}) {
  const conversationId = randomUUID();
  const traceId = newTraceId();
  const rootSpanId = newSpanId();
  const startedAt = now().toISOString();
  const attempts = [];

  function onAttempt(attempt) {
    const previous = attempts.at(-1);
    const record = {
      ...attempt,
      generationId: randomUUID(),
      spanId: newSpanId(),
    };
    attempts.push(record);
    if (typeof reportGeneration === 'function') {
      try {
        Promise.resolve(reportGeneration({
          ...record,
          conversationId,
          traceId,
          parentGenerationIds: previous ? [previous.generationId] : [],
        })).catch(() => {});
      } catch {
        // Telemetry never interrupts the chat route.
      }
    }
  }

  function finish(outcome, errorType) {
    if (typeof exportTrace !== 'function') return;
    try {
      Promise.resolve(exportTrace({
        traceId,
        rootSpanId,
        startedAt,
        completedAt: now().toISOString(),
        outcome,
        errorType,
        attempts,
      })).catch(() => {});
    } catch {
      // Telemetry never interrupts the chat route.
    }
  }

  return { conversationId, traceId, onAttempt, finish, attempts };
}
