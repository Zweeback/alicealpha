function recognitionConstructor() {
  return globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition || null;
}

export class VoiceChannel {
  constructor({ onListeningChange = () => {}, onSpeechEnergy = () => {}, ttsEndpoint = '/api/tts' } = {}) {
    this.onListeningChange = onListeningChange;
    this.onSpeechEnergy = onSpeechEnergy;
    this.ttsEndpoint = ttsEndpoint;
    this.neuralTtsEnabled = false;
    this.recognition = null;
    this.activeUtterance = null;
    this.activeAudio = null;
    this.activeAudioUrl = null;
    this.activeTtsController = null;
  }

  setNeuralTtsEnabled(enabled) {
    this.neuralTtsEnabled = Boolean(enabled);
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
      const timeout = globalThis.setTimeout(() => {
        recognition.stop();
        reject(new Error('speech-recognition-timeout'));
      }, timeoutMs);

      recognition.onstart = () => this.onListeningChange(true);
      recognition.onresult = (event) => {
        let interim = '';
        for (let index = event.resultIndex; index < event.results.length; index += 1) {
          const transcript = event.results[index][0].transcript;
          if (event.results[index].isFinal) finalText += transcript;
          else interim += transcript;
        }
        this.onSpeechEnergy(Math.min(1, (finalText.length + interim.length) / 70));
      };
      recognition.onerror = (event) => {
        globalThis.clearTimeout(timeout);
        this.onListeningChange(false);
        reject(new Error(event.error || 'speech-recognition-error'));
      };
      recognition.onend = () => {
        globalThis.clearTimeout(timeout);
        this.onListeningChange(false);
        this.recognition = null;
        if (finalText.trim()) resolve(finalText.trim());
        else reject(new Error('speech-recognition-empty'));
      };
      recognition.start();
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

    if (this.neuralTtsEnabled && globalThis.fetch && globalThis.Audio) {
      const controller = new AbortController();
      this.activeTtsController = controller;
      this.#speakNeural(plan, normalized, controller).catch(() => {
        if (!controller.signal.aborted) this.#speakBrowser(plan, normalized);
      });
      return { cancel: () => this.stopSpeaking() };
    }

    return this.#speakBrowser(plan, normalized);
  }

  #speakBrowser(plan, { onStart, onBoundary, onEnd }) {
    if (!this.canSpeak) {
      onStart();
      const timer = globalThis.setTimeout(onEnd, plan.duration_ms);
      return { cancel: () => globalThis.clearTimeout(timer) };
    }

    globalThis.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(plan.spoken_text);
    const selectedVoice = this.#preferredVoice(plan.voice.accent);
    utterance.voice = selectedVoice;
    utterance.lang = selectedVoice?.lang || plan.voice.language;
    utterance.rate = plan.voice.rate;
    utterance.pitch = plan.voice.pitch;
    utterance.volume = plan.voice.volume;
    utterance.onstart = onStart;
    utterance.onboundary = (event) => onBoundary(event.charIndex);
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
    return { cancel: () => this.stopSpeaking() };
  }

  async #speakNeural(plan, { onStart, onEnd }, controller) {
    const response = await fetch(this.ttsEndpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        text: plan.spoken_text,
        language: plan.voice?.language || 'de-DE',
        accent: plan.voice?.accent || null,
        rate: plan.voice?.rate || 1,
        pitch: plan.voice?.pitch || 1,
      }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`neural-tts-${response.status}`);

    const blob = await response.blob();
    if (!blob.size) throw new Error('neural-tts-empty');
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    this.activeAudio = audio;
    this.activeAudioUrl = url;

    audio.onplay = onStart;
    audio.onended = () => {
      this.#releaseAudio();
      onEnd();
    };
    audio.onerror = () => {
      this.#releaseAudio();
      onEnd();
    };
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
    const frenchFemale = accented.find((voice) => /female|amelie|amélie|audrey|marie|hortense|celine|céline|lea|léa|julie/i.test(voice.name));
    if (frenchFemale || accented[0]) return frenchFemale || accented[0];

    const german = voices.filter((voice) => voice.lang?.toLowerCase().startsWith('de'));
    return german.find((voice) => /female|katja|anna|petra|amala|seraphina|vicki/i.test(voice.name)) || german[0] || null;
  }
}
