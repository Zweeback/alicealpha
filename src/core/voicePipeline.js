import { AliceVad } from './vad.js';
import { AliceStt } from './stt.js';
import { AliceTts } from './tts.js';

export class VoicePipeline {
  constructor({
    onState = () => {},
    onTranscript = () => {},
    onUserTranscript = () => {},
    onSpeechEnergy = () => {},
    onViseme = () => {},
    onTool = async () => ({ ok: false }),
    xttsUrl = null,
  } = {}) {
    this.onState = onState;
    this.onTranscript = onTranscript;
    this.onUserTranscript = onUserTranscript;
    this.onSpeechEnergy = onSpeechEnergy;
    this.onViseme = onViseme;
    this.onTool = onTool;

    this.vad = new AliceVad({
      onSpeechStart: () => this.handleBargeIn(),
      onSpeechEnd: (buffer) => this.handleSpeechEnd(buffer),
    });
    this.stt = new AliceStt();
    this.tts = new AliceTts({ xttsUrl });

    this.state = 'idle'; // idle, listening, thinking, speaking
    this.abortController = null;
    this.speechEndTime = null;
    this.latencyLogged = false;
  }

  async startListening() {
    this.stop();
    this.setState('listening');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      await this.vad.start(stream);
    } catch {
      this.setState('idle');
      throw new Error('microphone-permission-denied');
    }
  }

  handleBargeIn() {
    if (this.state === 'speaking' || this.state === 'thinking') {
      this.stopResponse();
      this.setState('listening');
    }
  }

  async handleSpeechEnd(audioBuffer) {
    this.speechEndTime = performance.now();
    this.latencyLogged = false;
    this.setState('thinking');
    this.vad.stop();

    try {
      const text = await this.stt.transcribe(audioBuffer, { language: 'de' });
      if (!text) {
        this.setState('listening');
        await this.startListening();
        return;
      }
      this.onUserTranscript(text);
      await this.processUserTurn(text);
    } catch {
      this.setState('listening');
      await this.startListening();
    }
  }

  async processUserTurn(text) {
    this.abortController = new AbortController();
    let accumulatedText = '';

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
        signal: this.abortController.signal,
      });

      if (!response.ok) throw new Error('chat-api-error');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;
          const dataStr = trimmed.slice(6);
          if (dataStr === '[DONE]') continue;

          try {
            const data = JSON.parse(dataStr);
            if (data.delta?.content) {
              const content = data.delta.content;
              accumulatedText += content;
              this.onTranscript(accumulatedText, false);

              const sentences = this.tts.splitIntoSentences(accumulatedText);
              if (sentences.length > 1) {
                const completeSentence = sentences[0];
                accumulatedText = sentences.slice(1).join(' ');
                await this.speakSentence(completeSentence);
              }
            }
          } catch {
            // ignore chunk parse errors
          }
        }
      }

      if (accumulatedText.trim()) {
        await this.speakSentence(accumulatedText.trim());
      }

      this.onTranscript(accumulatedText, true);
      this.setState('idle');
    } catch (err) {
      if (err.name !== 'AbortError') {
        this.setState('idle');
      }
    }
  }

  async speakSentence(sentence) {
    this.setState('speaking');

    if (!this.latencyLogged && this.speechEndTime) {
      const latency = Math.round(performance.now() - this.speechEndTime);
      console.log(`[ALICE_VOICE_LATENCY_MS] ${latency}`);
      this.latencyLogged = true;
    }

    return new Promise((resolve) => {
      this.tts.speak(sentence, {
        onBoundary: (progress) => {
          this.onSpeechEnergy(Math.min(1, progress / 100));
          this.onViseme?.('aa');
        },
        onEnd: () => {
          this.onSpeechEnergy(0);
          this.onViseme?.('sil');
          resolve();
        },
      });
    });
  }

  stopResponse() {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    this.tts.stop();
    this.onSpeechEnergy(0);
    this.onViseme('sil');
  }

  stop() {
    this.stopResponse();
    this.vad.stop();
    this.setState('idle');
  }

  setState(newState) {
    this.state = newState;
    this.onState(newState);
  }
}
