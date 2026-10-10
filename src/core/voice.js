function recognitionConstructor() {
  return globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition || null;
}

const voiceModes = Object.freeze({
  french: Object.freeze({
    provider: 'browser',
    language: 'de-DE',
    accent: 'fr-FR',
    delivery: 'natural',
    rate: 0.9,
    pitch: 1.02,
    volume: 0.72,
  }),
  whisper: Object.freeze({
    provider: 'browser',
    language: 'de-DE',
    accent: 'de-DE',
    delivery: 'whisper',
    rate: 0.76,
    pitch: 0.96,
    volume: 0.28,
  }),
  hev: Object.freeze({
    provider: 'browser',
    language: 'de-DE',
    accent: 'de-DE',
    delivery: 'system',
    rate: 0.88,
    pitch: 0.68,
    volume: 0.86,
  }),
  glados: Object.freeze({
    provider: 'glados',
    language: 'en-US',
    accent: 'en-US',
    delivery: 'synthetic',
    rate: 0.9,
    pitch: 1,
    volume: 1,
  }),
});

export class VoiceChannel {
  constructor({
    onListeningChange = () => {},
    onSpeechEnergy = () => {},
    ttsEndpoint = '/api/tts',
    gladosEndpoint = '/api/glados-tts',
  } = {}) {
    this.onListeningChange = onListeningChange;
    this.onSpeechEnergy = onSpeechEnergy;
    this.ttsEndpoint = ttsEndpoint;
    this.gladosEndpoint = gladosEndpoint;
    this.mode = 'french';
    this.neuralTtsEnabled = false;
    this.recognition = null;
    this.activeUtterance = null;
    this.activeAudio = null;
    this.activeAudioUrl = null;
    this.activeTtsController = null;
  }

  setMode(mode) {
    if (voiceModes[mode]) this.mode = mode;
    return this.mode;
  }

  setNeuralTtsEnabled(enabled) {
    this.neuralTtsEnabled = Boolean(enabled);
  }

  get speaking() {
    return Boolean(this.activeUtterance || this.activeAudio);
  }

  get canListen() {
    return Boolean(recognitionConstructor());
  }

  get canSpeak() {
    return 'speechSynthesis' in globalThis && 'SpeechSynthesisUtterance' in globalThis;
  }

  listen({ language = 'de-DE', timeoutMs = 12000 } = {}) {
    const Recognition = recognitionConstructor();
    if (!Recognition) return Promise.reject(new Error('speech-recognition-unavailable'));

    this.stopListening();
    const recognition = new Recognition();
    recognition.lang = language;
    recognition.interimResults = true;
    recognition.continuous = false;
    this.recognition = recognition;

    return new Promise((resolve, reject) => {
      let finalText = '';
      let settled = false;
      let recognitionError = null;
      const settle = (error, value) => {
        if (settled) return;
        settled = true;
        globalThis.clearTimeout(timeout);
        this.onListeningChange(false);
        if (this.recognition === recognition) this.recognition = null;
        if (error) reject(error);
        else resolve(value);
      };
      const timeout = globalThis.setTimeout(() => {
        settle(new Error('speech-recognition-timeout'));
        try { recognition.abort(); } catch { /* Already ended. */ }
      }, timeoutMs);

      recognition.onstart = () => this.onListeningChange(true);
      recognition.onresult = (event) => {
        let interim = '';
        for (let index = event.resultIndex; index < event.results.length; index += 1) {
          const transcript = event.results[index][0].transcript;
          if (event.results[index].isFinal) finalText += transcript;
          else interim += transcript;
        }
        // This is the user's microphone input, not Alice's voice.
        // Do not animate Alice's mouth while the user is speaking.
      };
      recognition.onerror = (event) => {
        recognitionError = new Error(event.error || 'speech-recognition-error');
        settle(recognitionError);
      };
      recognition.onend = () => {
        if (settled) return;
        if (finalText.trim()) settle(null, finalText.trim());
        else settle(recognitionError || new Error('speech-recognition-empty'));
      };
      try {
        recognition.start();
      } catch (error) {
        settle(error);
      }
    });
  }

  stopListening() {
    try {
      this.recognition?.abort();
    } catch {
      // Browser engines can throw while transitioning between states.
    }
    this.recognition = null;
    this.onListeningChange(false);
  }

  speak(plan, callbacks = {}) {
    const normalized = {
      onStart: callbacks.onStart || (() => {}),
      onBoundary: callbacks.onBoundary || (() => {}),
      onEnd: callbacks.onEnd || (() => {}),
    };

    this.stopSpeaking();

    const modeVoice = voiceModes[this.mode] || voiceModes.french;
    const voicedPlan = {
      ...plan,
      voice: {
        ...(plan.voice || {}),
        ...modeVoice,
      },
    };

    if (this.mode === 'glados' && globalThis.fetch && globalThis.Audio) {
      const controller = new AbortController();
      this.activeTtsController = controller;
      this.#speakRemote(this.gladosEndpoint, voicedPlan, normalized, controller, 'glados').catch(() => {
        if (!controller.signal.aborted) this.#speakBrowser(voicedPlan, normalized);
      });
      return { cancel: () => this.stopSpeaking() };
    }

    if (this.neuralTtsEnabled && globalThis.fetch && globalThis.Audio) {
      const controller = new AbortController();
      this.activeTtsController = controller;
      this.#speakRemote(this.ttsEndpoint, voicedPlan, normalized, controller, null).catch(() => {
        if (!controller.signal.aborted) this.#speakBrowser(voicedPlan, normalized);
      });
      return { cancel: () => this.stopSpeaking() };
    }

    return this.#speakBrowser(voicedPlan, normalized);
  }

  #speakBrowser(plan, { onStart, onBoundary, onEnd }) {
    if (!this.canSpeak) {
      // Never simulate audible output when this browser has no speech synthesizer.
      // The text caption stays visible; the UI must not claim Alice is speaking.
      this.onSpeechEnergy(0);
      onEnd();
      return { cancel: () => {} };
    }

    globalThis.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(plan.spoken_text);
    const selectedVoice = this.#preferredVoice(plan.voice.accent);
    utterance.voice = selectedVoice;
    utterance.lang = selectedVoice?.lang || plan.voice.language;
    utterance.rate = plan.voice.rate;
    utterance.pitch = plan.voice.pitch;
    utterance.volume = plan.voice.volume;
    utterance.onstart = () => {
      this.onSpeechEnergy(0.16);
      onStart();
    };
    utterance.onboundary = (event) => {
      const position = Math.max(0, Number(event.charIndex) || 0);
      const fragment = String(plan.spoken_text || '').slice(position).match(/^\S+/)?.[0] || '';
      // Boundary-driven mouth motion is a coarse cue, never phoneme-accurate lip sync.
      this.onSpeechEnergy(Math.min(0.78, 0.25 + fragment.length * 0.045));
      onBoundary(position);
    };
    const complete = () => {
      if (this.activeUtterance !== utterance) return;
      this.activeUtterance = null;
      this.onSpeechEnergy(0);
      onEnd();
    };
    utterance.onend = complete;
    utterance.onerror = complete;
    this.activeUtterance = utterance;
    globalThis.speechSynthesis.speak(utterance);
    return { cancel: () => this.stopSpeaking() };
  }

  async #speakRemote(endpoint, plan, { onStart, onEnd }, controller, provider) {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        text: plan.spoken_text,
        language: plan.voice?.language || 'de-DE',
        accent: plan.voice?.accent || null,
        rate: plan.voice?.rate || 1,
        pitch: plan.voice?.pitch || 1,
        provider,
      }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`tts-${this.mode}-${response.status}`);

    const blob = await response.blob();
    if (!blob.size) throw new Error('tts-empty');
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    this.activeAudio = audio;
    this.activeAudioUrl = url;

    audio.onplay = () => {
      if (controller.signal.aborted) return;
      this.onSpeechEnergy(0.18);
      onStart();
    };
    const complete = () => {
      if (this.activeAudio !== audio) return;
      this.#releaseAudio();
      this.onSpeechEnergy(0);
      onEnd();
    };
    audio.onended = complete;
    audio.onerror = complete;
    if (controller.signal.aborted) {
      this.#releaseAudio();
      return;
    }
    await audio.play();
  }

  #releaseAudio() {
    this.activeAudio?.pause?.();
    this.activeAudio = null;
    if (this.activeAudioUrl) URL.revokeObjectURL(this.activeAudioUrl);
    this.activeAudioUrl = null;
    this.activeTtsController = null;
  }

  stopSpeaking() {
    this.onSpeechEnergy(0);
    this.activeTtsController?.abort?.();
    this.activeTtsController = null;
    this.#releaseAudio();
    globalThis.speechSynthesis?.cancel();
    this.activeUtterance = null;
  }

  #preferredVoice(accent = 'fr-FR') {
    const voices = globalThis.speechSynthesis?.getVoices?.() || [];
    voices.sort((a, b) => a.name.localeCompare(b.name));

    const accentPrefix = String(accent || '').slice(0, 2).toLowerCase();
    const accented = voices.filter((voice) => voice.lang?.toLowerCase().startsWith(accentPrefix));
    const preferred = accented.find((voice) => /female|amelie|amélie|audrey|marie|hortense|celine|céline|lea|léa|julie|zira|samantha/i.test(voice.name));
    if (preferred || accented[0]) return preferred || accented[0];

    const german = voices.filter((voice) => voice.lang?.toLowerCase().startsWith('de'));
    return german.find((voice) => /female|katja|anna|petra|amala|seraphina|vicki/i.test(voice.name)) || german[0] || null;
  }
}
