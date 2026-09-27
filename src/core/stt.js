export class AliceStt {
  constructor({ onProgress = () => {} } = {}) {
    this.onProgress = onProgress;
    this.pipeline = null;
    this.loading = false;
  }

  async transcribe(audioInput, { language = 'de' } = {}) {
    // 1. If audioInput is a string or fallback to Browser SpeechRecognition
    if (typeof audioInput === 'string') {
      return audioInput.trim();
    }

    // 2. Try server-side STT fallback if audio float buffer is provided
    if (audioInput instanceof Float32Array && audioInput.length > 0) {
      try {
        const wavBlob = this.encodeWav(audioInput, 16000);
        const formData = new FormData();
        formData.append('file', wavBlob, 'speech.wav');
        formData.append('model', 'whisper-large-v3-turbo');
        formData.append('language', language);

        const response = await fetch('/api/stt', {
          method: 'POST',
          body: formData,
        });

        if (response.ok) {
          const data = await response.json();
          if (data?.text) return data.text.trim();
        }
      } catch {
        // Fall back to local Web Speech API or return empty
      }
    }

    // 3. Browser SpeechRecognition fallback interface
    const Recognition = globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition;
    if (Recognition) {
      return new Promise((resolve, reject) => {
        const recognition = new Recognition();
        recognition.lang = language === 'de' ? 'de-DE' : language;
        recognition.interimResults = false;
        recognition.continuous = false;

        recognition.onresult = (event) => {
          const text = event.results?.[0]?.[0]?.transcript || '';
          resolve(text.trim());
        };
        recognition.onerror = (err) => reject(new Error(err.error || 'stt-failed'));
        recognition.onend = () => resolve('');
        recognition.start();
      });
    }

    return '';
  }

  encodeWav(samples, sampleRate = 16000) {
    const buffer = new ArrayBuffer(44 + samples.length * 2);
    const view = new DataView(buffer);

    /* RIFF identifier */
    this.#writeString(view, 0, 'RIFF');
    /* RIFF chunk length */
    view.setUint32(4, 36 + samples.length * 2, true);
    /* RIFF type */
    this.#writeString(view, 8, 'WAVE');
    /* format chunk identifier */
    this.#writeString(view, 12, 'fmt ');
    /* format chunk length */
    view.setUint32(16, 16, true);
    /* sample format (raw) */
    view.setUint16(20, 1, true);
    /* channel count */
    view.setUint16(22, 1, true);
    /* sample rate */
    view.setUint32(24, sampleRate, true);
    /* byte rate (sample rate * block align) */
    view.setUint32(28, sampleRate * 2, true);
    /* block align (channel count * bytes per sample) */
    view.setUint16(32, 2, true);
    /* bits per sample */
    view.setUint16(34, 16, true);
    /* data chunk identifier */
    this.#writeString(view, 36, 'data');
    /* data chunk length */
    view.setUint32(40, samples.length * 2, true);

    let offset = 44;
    for (let i = 0; i < samples.length; i++, offset += 2) {
      const s = Math.max(-1, Math.min(1, samples[i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    }

    return new Blob([buffer], { type: 'audio/wav' });
  }

  #writeString(view, offset, string) {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  }
}
