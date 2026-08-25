function safeJson(value, fallback = {}) {
  try {
    return typeof value === 'string' ? JSON.parse(value) : value || fallback;
  } catch {
    return fallback;
  }
}

export class RealtimeChannel {
  constructor({
    endpoint = '/api/realtime/session',
    onState = () => {},
    onEvent = () => {},
    onTranscript = () => {},
    onUserTranscript = () => {},
    onSpeechEnergy = () => {},
    onTool = async () => ({ ok: true }),
    onError = () => {},
  } = {}) {
    this.endpoint = endpoint;
    this.onState = onState;
    this.onEvent = onEvent;
    this.onTranscript = onTranscript;
    this.onUserTranscript = onUserTranscript;
    this.onSpeechEnergy = onSpeechEnergy;
    this.onTool = onTool;
    this.onError = onError;
    this.peer = null;
    this.channel = null;
    this.localStream = null;
    this.audio = null;
    this.audioContext = null;
    this.energyFrame = 0;
    this.state = 'idle';
    this.replyText = '';
    this.userText = '';
  }

  get connected() {
    return this.state === 'connected';
  }

  async connect() {
    if (this.connected) return;
    if (!globalThis.RTCPeerConnection || !navigator.mediaDevices?.getUserMedia) {
      throw new Error('webrtc-unavailable');
    }

    this.#setState('connecting');
    try {
      const peer = new RTCPeerConnection();
      this.peer = peer;
      this.audio = document.createElement('audio');
      this.audio.autoplay = true;
      this.audio.playsInline = true;
      peer.ontrack = (event) => {
        const [stream] = event.streams;
        if (!stream) return;
        this.audio.srcObject = stream;
        this.audio.play().catch(() => undefined);
        this.#watchEnergy(stream);
      };

      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
        video: false,
      });
      this.localStream.getAudioTracks().forEach((track) => peer.addTrack(track, this.localStream));

      const channel = peer.createDataChannel('oai-events');
      this.channel = channel;
      channel.addEventListener('message', this.#handleMessage);
      channel.addEventListener('close', () => this.#setState('disconnected'));

      const ready = new Promise((resolve, reject) => {
        const timer = globalThis.setTimeout(() => reject(new Error('realtime-data-timeout')), 15000);
        channel.addEventListener('open', () => {
          globalThis.clearTimeout(timer);
          resolve();
        }, { once: true });
      });

      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/sdp' },
        body: offer.sdp,
      });
      if (!response.ok) {
        const detail = await response.text();
        throw new Error(`realtime-session-${response.status}:${detail.slice(0, 180)}`);
      }
      await peer.setRemoteDescription({ type: 'answer', sdp: await response.text() });
      await ready;
      this.#setState('connected');
    } catch (error) {
      this.disconnect();
      this.#setState('error');
      this.onError(error);
      throw error;
    }
  }

  sendText(text) {
    const clean = String(text).trim();
    if (!clean || !this.#send({
      type: 'conversation.item.create',
      item: {
        type: 'message',
        role: 'user',
        content: [{ type: 'input_text', text: clean }],
      },
    })) return false;
    this.#send({ type: 'response.create' });
    return true;
  }

  sendPresence(presence) {
    if (!this.connected) return false;
    const observation = {
      present: Boolean(presence?.present),
      horizontal: Math.round((presence?.x || 0) * 100) / 100,
      vertical: Math.round((presence?.y || 0) * 100) / 100,
      distance: Math.round((presence?.distance || 0.5) * 100) / 100,
      visible_expression: presence?.expression || 'unknown',
      confidence: Math.round((presence?.confidence || 0) * 100) / 100,
    };
    return this.#send({
      type: 'conversation.item.create',
      item: {
        type: 'message',
        role: 'user',
        content: [{
          type: 'input_text',
          text: `[Nichtverbaler Kontext; unsichere Sensorbeobachtung, nicht laut vorlesen: ${JSON.stringify(observation)}]`,
        }],
      },
    });
  }

  sendToolOutput(callId, output) {
    if (!callId) return false;
    const sent = this.#send({
      type: 'conversation.item.create',
      item: {
        type: 'function_call_output',
        call_id: callId,
        output: JSON.stringify(output ?? { ok: true }),
      },
    });
    if (sent) this.#send({ type: 'response.create' });
    return sent;
  }

  interrupt() {
    this.#send({ type: 'response.cancel' });
    this.replyText = '';
  }

  disconnect() {
    cancelAnimationFrame(this.energyFrame);
    this.energyFrame = 0;
    this.localStream?.getTracks().forEach((track) => track.stop());
    this.localStream = null;
    this.channel?.removeEventListener('message', this.#handleMessage);
    this.channel?.close?.();
    this.channel = null;
    this.peer?.close?.();
    this.peer = null;
    this.audioContext?.close?.().catch?.(() => undefined);
    this.audioContext = null;
    if (this.audio) this.audio.srcObject = null;
    this.audio = null;
    this.#setState('disconnected');
  }

  #setState(state) {
    this.state = state;
    this.onState(state);
  }

  #send(event) {
    if (this.channel?.readyState !== 'open') return false;
    this.channel.send(JSON.stringify(event));
    return true;
  }

  #handleMessage = async (message) => {
    const event = safeJson(message.data, null);
    if (!event?.type) return;
    this.onEvent(event);

    if (event.type === 'input_audio_buffer.speech_started') {
      this.replyText = '';
      this.userText = '';
      this.onState('listening');
      return;
    }
    if (event.type === 'input_audio_buffer.speech_stopped') {
      this.onState('thinking');
      return;
    }
    if (event.type === 'conversation.item.input_audio_transcription.delta') {
      this.userText += event.delta || '';
      this.onUserTranscript(this.userText, false);
      return;
    }
    if (event.type === 'conversation.item.input_audio_transcription.completed') {
      this.userText = event.transcript || this.userText;
      this.onUserTranscript(this.userText, true);
      return;
    }
    if (event.type === 'response.output_audio_transcript.delta' || event.type === 'response.audio_transcript.delta') {
      this.replyText += event.delta || '';
      this.onTranscript(this.replyText, false);
      return;
    }
    if (event.type === 'response.output_audio_transcript.done' || event.type === 'response.audio_transcript.done') {
      this.replyText = event.transcript || this.replyText;
      this.onTranscript(this.replyText, true);
      return;
    }
    if (event.type === 'response.output_text.delta' || event.type === 'response.text.delta') {
      this.replyText += event.delta || '';
      this.onTranscript(this.replyText, false);
      return;
    }
    if (event.type === 'response.function_call_arguments.done') {
      const output = await this.onTool(event.name, safeJson(event.arguments), event);
      this.sendToolOutput(event.call_id, output);
      return;
    }
    if (event.type === 'response.done') {
      this.onState('connected');
      return;
    }
    if (event.type === 'error') {
      this.onError(new Error(event.error?.message || 'realtime-error'));
    }
  };

  #watchEnergy(stream) {
    try {
      this.audioContext = new AudioContext();
      const source = this.audioContext.createMediaStreamSource(stream);
      const analyser = this.audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.72;
      source.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      const frame = () => {
        analyser.getByteFrequencyData(data);
        const mean = data.reduce((sum, value) => sum + value, 0) / Math.max(1, data.length);
        this.onSpeechEnergy(Math.min(1, mean / 92));
        this.energyFrame = requestAnimationFrame(frame);
      };
      frame();
    } catch {
      // Timed mouth motion remains available when Web Audio is restricted.
    }
  }
}

export { safeJson };
