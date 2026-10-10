// Small, restart-safe state checkpoint. No chat texts, prompts, media or credentials.
export const CHECKPOINT_KEY = 'alice.ls.checkpoint.v1';
const validViews = new Set(['procedural', 'trellis', 'portrait']);
const validVoices = new Set(['french', 'whisper', 'hev', 'glados']);
const validStages = new Set(['idle', 'ready', 'listening', 'thinking', 'speaking', 'interrupted']);
export const CHECKPOINT_TTL_MS = 24 * 60 * 60 * 1000;
export function parseCheckpoint(value, now = Date.now()) {
  try {
    const obj = typeof value === 'string' ? JSON.parse(value) : value;
    if (!obj || obj.schema !== 1 || !Number.isFinite(obj.updatedAt) ||
      obj.updatedAt > now + 10000 || now - obj.updatedAt > CHECKPOINT_TTL_MS) return null;
    return {
      schema: 1,
      updatedAt: obj.updatedAt,
      stage: validStages.has(obj.stage) ? obj.stage : 'idle',
      view: validViews.has(obj.view) ? obj.view : 'procedural',
      voice: validVoices.has(obj.voice) ? obj.voice : 'french',
      completedTurns: Math.min(1000000, Math.max(0, Math.trunc(Number(obj.completedTurns) || 0))),
    };
  } catch { return null; }
}
export class AliceCheckpoint {
  constructor(storage = globalThis.localStorage, now = () => Date.now()) {
    this.storage = storage;
    this.now = now;
  }
  restore() {
    try { return parseCheckpoint(this.storage?.getItem(CHECKPOINT_KEY), this.now()); }
    catch { return null; }
  }
  save(fields = {}) {
    const last = this.restore() || {};
    const payload = parseCheckpoint({
      schema: 1,
      updatedAt: this.now(),
      stage: fields.stage ?? last.stage ?? 'idle',
      view: fields.view ?? last.view ?? 'procedural',
      voice: fields.voice ?? last.voice ?? 'french',
      completedTurns: fields.completedTurns ?? last.completedTurns ?? 0,
    }, this.now());
    if (!payload) return null;
    try { this.storage?.setItem(CHECKPOINT_KEY, JSON.stringify(payload)); }
    catch { /* loss of storage does not stop Alice */ }
    return payload;
  }
  clear() {
    try { this.storage?.removeItem(CHECKPOINT_KEY); }
    catch { /* storage may be disabled */ }
  }
}
