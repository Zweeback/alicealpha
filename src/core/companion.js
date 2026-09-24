const COMPANION_KEY = 'alice.companion.state.v1';

function safeParse(value) {
  try {
    const parsed = JSON.parse(value || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export class CompanionStore {
  constructor(storage = globalThis.localStorage, now = () => new Date().toISOString()) {
    this.storage = storage;
    this.now = now;
    this.state = {
      firstSeenAt: null,
      lastSeenAt: null,
      previousSeenAt: null,
      sessionCount: 0,
      turnCount: 0,
      ...safeParse(this.storage?.getItem(COMPANION_KEY)),
    };
  }

  #save() {
    try {
      this.storage?.setItem(COMPANION_KEY, JSON.stringify(this.state));
    } catch {
      // Companion continuity should never block the conversation.
    }
  }

  openSession() {
    const stamp = this.now();
    const previous = this.state.lastSeenAt || null;
    this.state.firstSeenAt ||= stamp;
    this.state.previousSeenAt = previous;
    this.state.lastSeenAt = stamp;
    this.state.sessionCount = Math.max(0, Number(this.state.sessionCount) || 0) + 1;
    this.#save();
    return this.snapshot();
  }

  recordTurn() {
    this.state.turnCount = Math.max(0, Number(this.state.turnCount) || 0) + 1;
    this.#save();
    return this.state.turnCount;
  }

  snapshot() {
    return {
      firstSeenAt: this.state.firstSeenAt,
      lastSeenAt: this.state.lastSeenAt,
      previousSeenAt: this.state.previousSeenAt,
      sessionCount: Math.max(0, Number(this.state.sessionCount) || 0),
      turnCount: Math.max(0, Number(this.state.turnCount) || 0),
    };
  }
}
