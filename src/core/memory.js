const MEMORY_KEY = 'alice.persona.memory.v2';

function memoryId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `mem-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export async function sha256(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export class MemoryStore {
  constructor(storage = globalThis.localStorage) {
    this.storage = storage;
    this.items = this.#load();
  }

  #load() {
    try {
      const parsed = JSON.parse(this.storage?.getItem(MEMORY_KEY) || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  #save() {
    try {
      this.storage?.setItem(MEMORY_KEY, JSON.stringify(this.items));
    } catch {
      // Private browsing and quota failures keep the current session usable.
    }
  }

  async propose(value, source = 'conversation') {
    const normalized = String(value).trim().replace(/\s+/g, ' ');
    if (!normalized) return null;
    const hash = await sha256(`${source}:${normalized.toLocaleLowerCase('de-DE')}`);
    const existing = this.items.find((item) => item.hash === hash && item.status !== 'rejected');
    if (existing) return existing;

    const candidate = {
      id: memoryId(),
      value: normalized,
      source,
      status: 'candidate',
      hash,
      createdAt: new Date().toISOString(),
      confirmedAt: null,
    };
    this.items.push(candidate);
    this.#save();
    return candidate;
  }

  confirm(id) {
    return this.#transition(id, 'confirmed');
  }

  reject(id) {
    return this.#transition(id, 'rejected');
  }

  async correct(id, value) {
    const item = this.items.find((entry) => entry.id === id);
    if (!item) return null;
    item.value = String(value).trim().replace(/\s+/g, ' ');
    item.hash = await sha256(`${item.source}:${item.value.toLocaleLowerCase('de-DE')}`);
    item.status = 'confirmed';
    item.confirmedAt = new Date().toISOString();
    this.#save();
    return item;
  }

  #transition(id, status) {
    const item = this.items.find((entry) => entry.id === id);
    if (!item) return null;
    item.status = status;
    item.confirmedAt = status === 'confirmed' ? new Date().toISOString() : null;
    this.#save();
    return item;
  }

  get(id) {
    return this.items.find((item) => item.id === id) || null;
  }

  confirmed() {
    return this.items.filter((item) => item.status === 'confirmed');
  }

  candidates() {
    return this.items.filter((item) => item.status === 'candidate');
  }

  recent(limit = 6) {
    return this.confirmed().slice(-limit);
  }

  snapshot() {
    return this.items.map((item) => ({ ...item }));
  }
}
