export class AliceVad {
  constructor({ onSpeechStart = () => {}, onSpeechEnd = () => {}, threshold = 0.015, minSpeechFrames = 3 } = {}) {
    this.onSpeechStart = onSpeechStart;
    this.onSpeechEnd = onSpeechEnd;
    this.threshold = threshold;
    this.minSpeechFrames = minSpeechFrames;
    this.audioContext = null;
    this.mediaStream = null;
    this.scriptNode = null;
    this.recording = false;
    this.isSpeaking = false;
    this.speechFrameCount = 0;
    this.silenceFrameCount = 0;
    this.audioBuffer = [];
  }

  async start(stream) {
    this.stop();
    this.mediaStream = stream || await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, sampleRate: 16000 } });
    const AudioCtx = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AudioCtx) throw new Error('web-audio-unsupported');

    this.audioContext = new AudioCtx({ sampleRate: 16000 });
    const source = this.audioContext.createMediaStreamSource(this.mediaStream);
    this.scriptNode = this.audioContext.createScriptProcessor(2048, 1, 1);

    source.connect(this.scriptNode);
    this.scriptNode.connect(this.audioContext.destination);

    this.recording = true;
    this.isSpeaking = false;
    this.speechFrameCount = 0;
    this.silenceFrameCount = 0;
    this.audioBuffer = [];

    this.scriptNode.onaudioprocess = (event) => {
      if (!this.recording) return;
      const input = event.inputBuffer.getChannelData(0);
      let sumSq = 0;
      for (let i = 0; i < input.length; i++) {
        sumSq += input[i] * input[i];
      }
      const rms = Math.sqrt(sumSq / input.length);

      if (rms >= this.threshold) {
        this.speechFrameCount += 1;
        this.silenceFrameCount = 0;
        if (!this.isSpeaking && this.speechFrameCount >= this.minSpeechFrames) {
          this.isSpeaking = true;
          this.onSpeechStart();
        }
      } else {
        this.silenceFrameCount += 1;
        if (this.isSpeaking && this.silenceFrameCount >= 10) {
          this.isSpeaking = false;
          this.speechFrameCount = 0;
          const merged = this.#flattenBuffer(this.audioBuffer);
          this.audioBuffer = [];
          this.onSpeechEnd(merged);
        }
      }

      if (this.isSpeaking || this.speechFrameCount > 0) {
        this.audioBuffer.push(new Float32Array(input));
      }
    };
  }

  stop() {
    this.recording = false;
    if (this.scriptNode) {
      this.scriptNode.onaudioprocess = null;
      this.scriptNode.disconnect();
      this.scriptNode = null;
    }
    if (this.audioContext) {
      this.audioContext.close().catch(() => undefined);
      this.audioContext = null;
    }
    this.isSpeaking = false;
    this.audioBuffer = [];
  }

  #flattenBuffer(buffers) {
    let totalLength = 0;
    for (const buf of buffers) totalLength += buf.length;
    const result = new Float32Array(totalLength);
    let offset = 0;
    for (const buf of buffers) {
      result.set(buf, offset);
      offset += buf.length;
    }
    return result;
  }
}
