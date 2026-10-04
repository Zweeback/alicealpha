import { BrowserTurnTrace, reportTurnTrace } from './turnTrace.js';

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
    onTrace = () => {},
    onError = () => {},
  } = {}) {
    this.endpoint = endpoint;
    this.onState = onState;
    this.onEvent = onEvent;
    this.onTranscript = onTranscript;
    this.onUserTranscript = onUserTranscript;
    this.onSpeechEnergy = onSpeechEnergy;
    this.onTool = onTool;
    this.onTrace = onTrace;
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
    this.turnTrace = new BrowserTurnTrace();
    this.micReadyAt = null;
    this.receivedAudio = false;
    this.responseCompleted = false;
    this.traceFinishTimer = null;
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

      const micStartedAt = Date.now();
      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
        video: false,
      });
      this.micReadyAt = Date.now();
      this.micLatencyMs = this.micReadyAt - micStartedAt;
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
      if (!this.turnTrace.active && this.micReadyAt) {
        this.turnTrace.begin({ stages: [
          { stage: 'mic', status: 'ok', latency_ms: this.micLatencyMs ?? null, detail: { source: 'getUserMedia' } },
          { stage: 'vad', status: 'skipped', detail: { reason: 'session-setup-failed' } },
          { stage: 'stt', status: 'skipped', detail: { reason: 'session-setup-failed' } },
          { stage: 'agent', status: 'failed', error_code: 'REALTIME_TRANSPORT_LOSS' },
        ] });
      } else if (!this.turnTrace.active) {
        this.turnTrace.begin({ stages: [{ stage: 'mic', status: 'failed', error_code: 'MIC_UNAVAILABLE' }] });
      } else {
        this.turnTrace.failActive(this.micReadyAt ? 'REALTIME_TRANSPORT_LOSS' : 'MIC_UNAVAILABLE', this.micReadyAt ? 'agent' : 'mic');
      }
      this.#publishTrace(this.turnTrace.finish({ textOnly: true }));
      this.disconnect();
      this.#setState('error');
      this.onError(error);
      throw error;
    }
  }

  sendText(text) {
    const clean = String(text).trim();
    if (clean && !this.turnTrace.active) {
      this.receivedAudio = false;
      this.turnTrace.begin({
        stages: [
          { stage: 'mic', status: 'skipped', detail: { reason: 'text-input' } },
          { stage: 'vad', status: 'skipped', detail: { reason: 'text-input' } },
          { stage: 'stt', status: 'skipped', detail: { reason: 'text-input' } },
          { stage: 'agent', status: 'pending' },
        ],
      });
    }
    if (!clean || !this.#send({
      type: 'conversation.item.create',
      item: {
        type: 'message',
        role: 'user',
        content: [{ type: 'input_text', text: clean }],
      },
    })) {
      if (this.turnTrace.active) {
        this.turnTrace.failActive('LLM_TIMEOUT', 'agent');
        this.#publishTrace(this.turnTrace.finish({ textOnly: true }));
      }
      return false;
    }
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
    if (this.turnTrace.active) this.#publishTrace(this.turnTrace.finish());
  }

  markAvatarSignal(detail = null) {
    if (!this.turnTrace.active) return false;
    this.turnTrace.mark('avatar', 'ok', { detail });
    this.#finishAudioTraceIfReady();
    return true;
  }

  completeResponse() {
    if (!this.turnTrace.active) return false;
    this.responseCompleted = true;
    if (!this.receivedAudio) {
      this.#publishTrace(this.turnTrace.finish({ textOnly: true }));
      return true;
    }
    if (this.#finishAudioTraceIfReady()) return true;
    this.traceFinishTimer = globalThis.setTimeout(() => {
      if (this.turnTrace.active) this.#publishTrace(this.turnTrace.finish());
    }, 1800);
    return false;
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
    this.micReadyAt = null;
    this.micLatencyMs = null;
    if (this.traceFinishTimer) globalThis.clearTimeout(this.traceFinishTimer);
    this.traceFinishTimer = null;
    this.responseCompleted = false;
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

  #finishAudioTraceIfReady() {
    if (!this.turnTrace.active || !this.responseCompleted) return false;
    const stages = this.turnTrace.snapshot()?.stages || [];
    const status = (name) => stages.find((stage) => stage.stage === name)?.status;
    if (status('playback') !== 'ok' || status('avatar') !== 'ok') return false;
    this.#publishTrace(this.turnTrace.finish());
    return true;
  }

  #publishTrace(trace) {
    if (!trace) return;
    if (this.traceFinishTimer) globalThis.clearTimeout(this.traceFinishTimer);
    this.traceFinishTimer = null;
    this.responseCompleted = false;
    this.onTrace(trace);
    globalThis.__aliceLastTurnTrace = trace;
    reportTurnTrace(trace)
      .then((diagnosis) => {
        globalThis.__aliceLastTurnDiagnosis = diagnosis;
      })
      .catch(() => undefined);
  }

  #handleMessage = async (message) => {
    const event = safeJson(message.data, null);
    if (!event?.type) return;
    this.onEvent(event);

    if (event.type === 'input_audio_buffer.speech_started') {
      if (this.traceFinishTimer) globalThis.clearTimeout(this.traceFinishTimer);
      this.traceFinishTimer = null;
      this.responseCompleted = false;
      this.receivedAudio = false;
      this.turnTrace.begin({
        stages: [
          { stage: 'mic', status: 'ok', latency_ms: this.micLatencyMs ?? null, detail: { source: 'getUserMedia' } },
          { stage: 'vad', status: 'ok', detail: { event: event.type } },
          { stage: 'stt', status: 'pending' },
        ],
      });
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
      if (this.turnTrace.active) {
        this.turnTrace.mark('stt', 'ok', { detail: { characters: (event.transcript || this.userText).length } });
        this.turnTrace.mark('agent', 'pending');
      }
      this.userText = event.transcript || this.userText;
      this.onUserTranscript(this.userText, true);
      return;
    }
    if (event.type === 'response.output_audio_transcript.delta' || event.type === 'response.audio_transcript.delta') {
      if (this.turnTrace.active && !this.receivedAudio) {
        this.receivedAudio = true;
        this.turnTrace.mark('agent', 'ok');
        this.turnTrace.mark('tts', 'ok', { detail: { event: event.type } });
        this.turnTrace.mark('playback', 'pending');
        this.turnTrace.mark('avatar', 'pending');
      }
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
      if (this.turnTrace.active) this.turnTrace.mark('agent', 'ok', { detail: { event: event.type } });
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
      if (this.turnTrace.active && !this.receivedAudio) {
        this.turnTrace.mark('agent', 'ok', { detail: { event: event.type } });
      }
      this.completeResponse();
      this.onState('connected');
      return;
    }
    if (event.type === 'error') {
      if (this.turnTrace.active) {
        this.turnTrace.failActive(event.error?.code || 'LLM_TIMEOUT');
        this.#publishTrace(this.turnTrace.finish());
      }
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
        const energy = Math.min(1, mean / 92);
        if (energy > 0.035 && this.turnTrace.active) {
          this.turnTrace.mark('playback', 'ok', { detail: { source: 'remote-audio-analyser' } });
        }
        this.onSpeechEnergy(energy);
        this.energyFrame = requestAnimationFrame(frame);
      };
      frame();
    } catch {
      // Timed mouth motion remains available when Web Audio is restricted.
    }
  }
}

export { safeJson };
