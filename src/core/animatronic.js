import { validatePerformancePlan } from './performance.js';

export class AnimatronicBridge {
  constructor() {
    this.port = null;
    this.writer = null;
    this.encoder = new TextEncoder();
  }

  get supported() {
    return Boolean(navigator.serial);
  }

  get connected() {
    return Boolean(this.writer);
  }

  async connect() {
    if (!this.supported) throw new Error('web-serial-unavailable');
    this.port = await navigator.serial.requestPort();
    await this.port.open({ baudRate: 115200 });
    this.writer = this.port.writable.getWriter();
    await this.#write({ type: 'hello', protocol: 'alice-performance/1.0' });
  }

  async sendPlan(plan) {
    if (!this.connected || !validatePerformancePlan(plan)) return false;
    await this.#write({ type: 'performance_plan', plan });
    return true;
  }

  async cancel(utteranceId) {
    if (!this.connected) return;
    await this.#write({ type: 'cancel', utterance_id: utteranceId });
  }

  async disconnect() {
    if (!this.port) return;
    try {
      await this.#write({ type: 'safe_hold' });
      this.writer?.releaseLock();
      this.writer = null;
      await this.port.close();
    } finally {
      this.port = null;
    }
  }

  async #write(message) {
    await this.writer?.write(this.encoder.encode(`${JSON.stringify(message)}\n`));
  }
}
