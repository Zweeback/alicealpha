export class AliceTts {
  constructor({ xttsUrl = null, piperVoice = 'de_DE-eva_k-x_low' } = {}) {
    this.xttsUrl = xttsUrl;
    this.piperVoice = piperVoice;
    this.activeAudio = null;
    this.activeUtterance = null;
  }

  splitIntoSentences(text) {
    if (!text) return [];
    const sentences = text.match(/[^.!?\n]+[.!?\n]+/g) || [text];
    return sentences.map((s) => s.trim()).filter(Boolean);
  }

  async speak(text, { onBoundary = () => {}, onEnd = () => {} } = {}) {
    this.stop();

    if (!text || !text.trim()) {
      onEnd();
      return { cancel: () => {} };
    }

    // Engine A: XTTS via ALICE_XTTS_URL
    if (this.xttsUrl) {
      try {
        const audioUrl = await this.#fetchXttsAudio(text, 2500);
        return this.#playAudioUrl(audioUrl, onBoundary, onEnd);
      } catch {
        // Fall back to Next Engine if XTTS times out or fails
      }
    }

    // Engine C / Fallback: Web Speech API
    return this.#speakWebSpeech(text, onBoundary, onEnd);
  }

  stop() {
    if (this.activeAudio) {
      this.activeAudio.pause();
      this.activeAudio.currentTime = 0;
      this.activeAudio = null;
    }
    if (globalThis.speechSynthesis) {
      globalThis.speechSynthesis.cancel();
      this.activeUtterance = null;
    }
  }

  async #fetchXttsAudio(text, timeoutMs = 2500) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(`${this.xttsUrl.replace(/\/$/, '')}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, language: 'de' }),
        signal: controller.signal,
      });

      clearTimeout(timer);
      if (!response.ok) throw new Error('xtts-failed');

      const blob = await response.blob();
      return URL.createObjectURL(blob);
    } catch (err) {
      clearTimeout(timer);
      throw err;
    }
  }

  #playAudioUrl(url, onBoundary, onEnd) {
    const audio = new Audio(url);
    this.activeAudio = audio;

    audio.ontimeupdate = () => {
      if (audio.duration) {
        onBoundary(Math.floor((audio.currentTime / audio.duration) * 100));
      }
    };

    audio.onended = () => {
      this.activeAudio = null;
      onEnd();
    };

    audio.onerror = () => {
      this.activeAudio = null;
      onEnd();
    };

    audio.play().catch(() => onEnd());

    return {
      cancel: () => {
        audio.pause();
        audio.currentTime = 0;
        this.activeAudio = null;
      },
    };
  }

  #speakWebSpeech(text, onBoundary, onEnd) {
    if (!('speechSynthesis' in globalThis && 'SpeechSynthesisUtterance' in globalThis)) {
      const timer = globalThis.setTimeout(onEnd, 1000);
      return { cancel: () => globalThis.clearTimeout(timer) };
    }

    globalThis.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'de-DE';
    utterance.rate = 1.0;
    utterance.pitch = 1.0;

    const voices = globalThis.speechSynthesis.getVoices() || [];
    const germanVoices = voices.filter((v) => v.lang?.toLowerCase().startsWith('de'));
    const preferred = germanVoices.find((v) => /female|katja|anna|petra|amala|seraphina|vicki/i.test(v.name)) || germanVoices[0];
    if (preferred) utterance.voice = preferred;

    utterance.onboundary = (e) => onBoundary(e.charIndex);
    utterance.onend = () => {
      this.activeUtterance = null;
      onEnd();
    };
    utterance.onerror = () => {
      this.activeUtterance = null;
      onEnd();
    };

    this.activeUtterance = utterance;
    globalThis.speechSynthesis.speak(utterance);

    return { cancel: () => this.stop() };
  }
}
