function recognitionConstructor() {
  return globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition || null;
}

export class VoiceChannel {
  constructor({ onListeningChange = () => {}, onSpeechEnergy = () => {} } = {}) {
    this.onListeningChange = onListeningChange;
    this.onSpeechEnergy = onSpeechEnergy;
    this.recognition = null;
    this.activeUtterance = null;
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

  speak(plan, { onStart = () => {}, onBoundary = () => {}, onEnd = () => {} } = {}) {
    if (!this.canSpeak) {
      onStart();
      const timer = globalThis.setTimeout(onEnd, plan.duration_ms);
      return { cancel: () => globalThis.clearTimeout(timer) };
    }

    globalThis.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(plan.spoken_text);
    utterance.lang = plan.voice.language;
    utterance.rate = plan.voice.rate;
    utterance.pitch = plan.voice.pitch;
    utterance.volume = plan.voice.volume;
    utterance.voice = this.#preferredVoice();
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

  stopSpeaking() {
    globalThis.speechSynthesis?.cancel();
    this.activeUtterance = null;
  }

  #preferredVoice() {
    const voices = globalThis.speechSynthesis?.getVoices?.() || [];
    const german = voices.filter((voice) => voice.lang?.toLowerCase().startsWith('de'));
    return german.find((voice) => /female|katja|anna|petra|amala|seraphina|vicki/i.test(voice.name)) || german[0] || null;
  }
}
