import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatronicBridge } from './core/animatronic.js';
import { CompanionStore } from './core/companion.js';
import { MemoryStore } from './core/memory.js';
import { PersonaRuntime } from './core/runtime.js';
import { RealtimeChannel } from './core/realtime.js';
import { CameraPresence } from './core/vision.js';
import { VoiceChannel } from './core/voice.js';
import { AliceWorld } from './xr/AliceWorld.js';
import { isExplicit3DSelection, isPortraitSelection } from './xr/avatarCatalog.js';
import { ALICE_VISUAL_DEMO, visualDemoEnabled } from './xr/demoDirector.js';
import { callModeEnabled } from './core/callMode.js';

const labels = {
  booting: 'Alice erwacht',
  ready: 'Bereit',
  connecting: 'Verbindung wird geöffnet',
  connected: 'Ich höre zu',
  listening: 'Ich höre zu',
  thinking: 'Ich denke nach',
  speaking: 'Alice spricht',
  offline: 'Basismodus · keine Live-KI',
  local: 'Lokale KI · auf diesem Gerät',
  error: 'Verbindung unterbrochen',
};

export default function App() {
  const search = globalThis.location?.search || '';
  const demoMode = visualDemoEnabled(search);
  const callMode = callModeEnabled(search);
  const canvasRef = useRef(null);
  const overlayRef = useRef(null);
  const worldRef = useRef(null);
  const cameraRef = useRef(null);
  const realtimeRef = useRef(null);
  const voiceRef = useRef(null);
  const memoryRef = useRef(null);
  const companionRef = useRef(null);
  const runtimeRef = useRef(null);
  const hardwareRef = useRef(null);
  const interactRef = useRef(null);
  const presenceRef = useRef({ present: false, confidence: 0 });
  const sessionModeRef = useRef('desktop');
  const fallbackBusyRef = useRef(false);

  const [phase, setPhase] = useState('booting');
  const [caption, setCaption] = useState('');
  const [userCaption, setUserCaption] = useState('');
  const [sessionMode, setSessionMode] = useState('desktop');
  const [xrSupport, setXrSupport] = useState({ ar: false, vr: false });
  const [realtimeAvailable, setRealtimeAvailable] = useState(false);
  const [renderFallback, setRenderFallback] = useState(false);
  const [textOpen, setTextOpen] = useState(false);
  const [textValue, setTextValue] = useState('');
  const [hintVisible, setHintVisible] = useState(true);
  const [localAIStatus, setLocalAIStatus] = useState('idle');
  const [localAIProgress, setLocalAIProgress] = useState(0);
  const [localAISupported, setLocalAISupported] = useState(null);
  const [companionState, setCompanionState] = useState({ sessionCount: 0, turnCount: 0 });
  const [confirmedMemoryCount, setConfirmedMemoryCount] = useState(0);
  const [chatMessages, setChatMessages] = useState([]);

  const setMode = useCallback((mode) => {
    sessionModeRef.current = mode;
    setSessionMode(mode);
    if (mode === 'ar') setCaption('Tippe auf eine Fläche, um Alice dort zu platzieren.');
  }, []);

  const ensureCamera = useCallback(async () => {
    if (sessionModeRef.current !== 'desktop' || cameraRef.current?.running) return;
    try {
      await cameraRef.current?.start();
    } catch {
      // Eye contact still follows pointer or headset when camera access is declined.
    }
  }, []);

  const runLocalTurn = useCallback(async (text, { recordUser = true } = {}) => {
    if (!text || fallbackBusyRef.current) return;
    fallbackBusyRef.current = true;
    if (recordUser) {
      companionRef.current?.recordMessage('user', text, 'local-input');
      setChatMessages(companionRef.current?.history?.(60) || []);
    }
    setUserCaption(text);
    setPhase('thinking');
    try {
      const result = await runtimeRef.current.respond(text);
      setCompanionState(companionRef.current?.snapshot?.() || { sessionCount: 0, turnCount: 0 });
      setConfirmedMemoryCount(memoryRef.current?.confirmed?.().length || 0);
      companionRef.current?.recordMessage('alice', result.reply, result.source || 'local');
      setChatMessages(companionRef.current?.history?.(60) || []);
      setCaption(result.reply);
      setPhase('speaking');
      worldRef.current?.playPlan(result.plan);
      hardwareRef.current?.sendPlan(result.plan).catch(() => undefined);
      voiceRef.current?.speak(result.plan, {
        onEnd: () => {
          fallbackBusyRef.current = false;
          setPhase(runtimeRef.current?.browserAIReady ? 'local' : 'offline');
        },
      });
    } catch {
      fallbackBusyRef.current = false;
      setPhase('error');
      setCaption('Die Verbindung ist gerade abgerissen. Versuch es noch einmal.');
    }
  }, []);

  const listenLocally = useCallback(async () => {
    const voice = voiceRef.current;
    if (!voice?.canListen) {
      setTextOpen(true);
      setPhase(runtimeRef.current?.browserAIReady ? 'local' : 'offline');
      return;
    }
    if (fallbackBusyRef.current) {
      voice.stopSpeaking();
      worldRef.current?.stopPlan();
      fallbackBusyRef.current = false;
    }
    setCaption('');
    setUserCaption('');
    setPhase('listening');
    try {
      await runLocalTurn(await voice.listen());
    } catch (error) {
      setPhase(runtimeRef.current?.browserAIReady ? 'local' : 'offline');
      if (error?.message !== 'aborted') setTextOpen(true);
    }
  }, [runLocalTurn]);

  const enableLocalAI = useCallback(async () => {
    const runtime = runtimeRef.current;
    if (!runtime || localAIStatus === 'loading' || runtime.browserAIReady) return;

    if (!runtime.browserAISupported) {
      setLocalAISupported(false);
      setLocalAIStatus('unsupported');
      setCaption('Dieses Gerät stellt WebGPU nicht bereit. Der kleine lokale KI-Modus kann hier nicht geladen werden.');
      return;
    }

    setLocalAISupported(true);
    setLocalAIStatus('loading');
    setLocalAIProgress(0);
    setCaption('Ich lade mein kleines lokales Sprachmodell. Das passiert nur nach deiner Freigabe und braucht kein API-Guthaben.');

    try {
      await runtime.enableBrowserAI((progress) => {
        const fraction = Number(progress?.progress);
        if (Number.isFinite(fraction)) {
          setLocalAIProgress(Math.max(0, Math.min(100, Math.round(fraction * 100))));
        }
      });
      setLocalAIStatus('ready');
      setLocalAIProgress(100);
      setPhase('local');
      setCaption('Lokale KI ist bereit. Antworten werden jetzt direkt auf diesem Gerät erzeugt.');
      setTextOpen(true);
    } catch (error) {
      setLocalAIStatus('failed');
      setPhase('offline');
      setCaption(error?.message === 'webgpu-unavailable'
        ? 'WebGPU ist auf diesem Gerät nicht verfügbar.'
        : 'Das lokale Modell konnte nicht geladen werden. Der einfache Basismodus bleibt verfügbar.');
    }
  }, [localAIStatus]);

  const ensureLive = useCallback(async () => {
    setHintVisible(false);
    ensureCamera().catch(() => undefined);
    const realtime = realtimeRef.current;
    if (realtimeAvailable && realtime && !realtime.connected) {
      setPhase('connecting');
      try {
        await realtime.connect();
        realtime.sendPresence(presenceRef.current);
        setCaption('Ich bin da. Sprich einfach mit mir.');
        setPhase('connected');
        return;
      } catch (error) {
        setRealtimeAvailable(false);
        if (error.message && error.message.includes('webrtc-unavailable')) {
          setCaption('Der Live-Kanal ist auf diesem Gerät nicht verfügbar. Ich wechsle in den lokalen Modus.');
        } else if (error.message && error.message.includes('realtime-session-429')) {
          setCaption('Der Live-Kanal hat gerade kein Kontingent. Ich wechsle in den lokalen Modus.');
        } else {
          setCaption('Der Live-Kanal ist gerade nicht erreichbar. Ich wechsle in den lokalen Modus.');
        }
        await listenLocally();
        return;
      }
    }
    if (realtime?.connected) {
      setCaption('Ich höre dir zu.');
      return;
    }
    await listenLocally();
  }, [ensureCamera, listenLocally, realtimeAvailable]);

  const endCall = useCallback(() => {
    realtimeRef.current?.disconnect();
    cameraRef.current?.stop();
    voiceRef.current?.stopListening();
    voiceRef.current?.stopSpeaking();
    worldRef.current?.stopPlan();
    fallbackBusyRef.current = false;
    setCaption('');
    setUserCaption('');
    setTextOpen(false);
    setHintVisible(true);
    setPhase(realtimeAvailable ? 'ready' : runtimeRef.current?.browserAIReady ? 'local' : 'offline');
  }, [realtimeAvailable]);

  useEffect(() => {
    interactRef.current = ensureLive;
  }, [ensureLive]);

  useEffect(() => {
    const memory = new MemoryStore();
    const companion = new CompanionStore();
    const openedCompanionState = companion.openSession();
    const runtime = new PersonaRuntime(memory, undefined, companion);
    setCompanionState(openedCompanionState);
    setChatMessages(companion.history(60));
    setConfirmedMemoryCount(memory.confirmed().length);
    setLocalAISupported(runtime.browserAISupported);
    const hardware = new AnimatronicBridge();
    const voice = new VoiceChannel({
      onListeningChange: (active) => active && setPhase('listening'),
      onSpeechEnergy: (energy) => worldRef.current?.setSpeechEnergy(energy),
    });
    memoryRef.current = memory;
    companionRef.current = companion;
    runtimeRef.current = runtime;
    hardwareRef.current = hardware;
    voiceRef.current = voice;

    let world;
    try {
      world = new AliceWorld(canvasRef.current, {
        overlayRoot: overlayRef.current,
        onInteract: () => interactRef.current?.(),
        onSessionChange: setMode,
      });
      world.init().catch((error) => {
        console.warn('Alice 3D initialization failed; using portrait fallback:', error);
        setRenderFallback(true);
      });
      world.support().then(setXrSupport).catch(() => undefined);
    } catch (error) {
      console.warn('WebGL unavailable; using Alice portrait/text fallback:', error);
      setRenderFallback(true);
      setXrSupport({ ar: false, vr: false });
      world = {
        setPresence() {},
        stopPlan() {},
        setSpeechEnergy() {},
        playPlan() {},
        playCue() {},
        dispose() {},
        async support() { return { ar: false, vr: false }; },
        async startXR() { throw new Error('webgl-unavailable'); },
      };
    }
    worldRef.current = world;

    let demoTimer = null;
    let demoIndex = 0;
    const runDemoBeat = () => {
      if (!demoMode) return;
      const beat = ALICE_VISUAL_DEMO[demoIndex % ALICE_VISUAL_DEMO.length];
      demoIndex += 1;
      setHintVisible(false);
      setUserCaption('');
      setCaption(beat.caption);
      setPhase(beat.phase);
      presenceRef.current = beat.presence;
      world.setPresence(beat.presence);
      world.playCue(beat.cue);
      demoTimer = globalThis.setTimeout(runDemoBeat, beat.duration_ms);
    };
    if (demoMode) demoTimer = globalThis.setTimeout(runDemoBeat, 350);

    const camera = new CameraPresence({
      onPresence: (presence) => {
        presenceRef.current = presence;
        world.setPresence(presence);
      },
    });
    cameraRef.current = camera;

    const realtime = new RealtimeChannel({
      onState: (state) => {
        if (state === 'disconnected' && phase !== 'booting') setPhase('offline');
        else if (labels[state]) setPhase(state);
      },
      onEvent: (event) => {
        if (event.type === 'input_audio_buffer.speech_started') {
          realtimeRef.current?.sendPresence(presenceRef.current);
          world.stopPlan();
        }
      },
      onTranscript: (text, done) => {
        setCaption(text);
        setPhase(done ? 'connected' : 'speaking');
        if (done && text?.trim()) {
          companion.recordMessage('alice', text, 'realtime');
          setChatMessages(companion.history(60));
        }
      },
      onUserTranscript: (text, done) => {
        setUserCaption(text);
        if (done && text?.trim()) {
          companion.recordMessage('user', text, 'voice');
          setChatMessages(companion.history(60));
        }
      },
      onSpeechEnergy: (energy) => world.setSpeechEnergy(energy),
      onTool: async (name, args) => {
        if (name === 'get_companion_state') {
          const state = companion.snapshot();
          return { ok: true, ...state, confirmedMemories: memory.confirmed().length };
        }
        if (name === 'drive_avatar') {
          world.playCue(args);
          return { ok: true, embodied: true };
        }
        if (name === 'propose_memory') {
          const candidate = await memory.propose(args.value, args.source);
          return {
            ok: Boolean(candidate),
            candidate_id: candidate?.id,
            status: candidate?.status,
            instruction: 'Bitte den Nutzer jetzt ausdrücklich um Bestätigung.',
          };
        }
        if (name === 'resolve_memory') {
          const item = args.decision === 'confirm'
            ? memory.confirm(args.candidate_id)
            : memory.reject(args.candidate_id);
          setConfirmedMemoryCount(memory.confirmed().length);
          return { ok: Boolean(item), status: item?.status };
        }
        return { ok: false, error: 'unknown-tool' };
      },
      onError: () => {
        setPhase('error');
        setCaption('Der Live-Kanal wurde unterbrochen. Tippe Alice an, um es erneut zu versuchen.');
      },
    });
    realtimeRef.current = realtime;

    fetch('/api/health')
      .then((response) => response.ok ? response.json() : null)
      .then((health) => {
        // Client diagnostics: also require WebRTC capability
        const canWebRTC = Boolean(globalThis.RTCPeerConnection && navigator.mediaDevices?.getUserMedia);
        const available = Boolean(health?.realtime) && canWebRTC;
        runtime.endpoint = health?.ollama ? '/api/local/respond' : null;
        setRealtimeAvailable(available);
        voice.setNeuralTtsEnabled(Boolean(health?.tts));
        setPhase(available ? 'ready' : health?.ollama ? 'local' : 'offline');
        if (!available && health?.ollama) {
          setCaption(`Lokales Ollama ist verbunden · ${health.ollamaModel || 'Modell bereit'}`);
        }
      })
      .catch(() => setPhase('offline'));

    const keyHandler = (event) => {
      if (event.target instanceof HTMLInputElement) return;
      if (event.key.toLowerCase() === 't') setTextOpen((open) => !open);
      if (event.key === ' ') {
        event.preventDefault();
        interactRef.current?.();
      }
      if (event.key.toLowerCase() === 'h') {
        hardware.connect()
          .then(() => setCaption('Der animatronische Körper ist verbunden.'))
          .catch(() => setCaption('Die Hardware-Verbindung wurde nicht geöffnet.'));
      }
    };
    window.addEventListener('keydown', keyHandler);

    return () => {
      window.removeEventListener('keydown', keyHandler);
      camera.stop();
      realtime.disconnect();
      voice.stopListening();
      voice.stopSpeaking();
      hardware.disconnect().catch(() => undefined);
      if (demoTimer) globalThis.clearTimeout(demoTimer);
      world.dispose();
    };
  }, [setMode, demoMode]);

  const enterXR = async (mode) => {
    setHintVisible(false);
    try {
      await worldRef.current?.startXR(mode);
      if (mode === 'vr') await ensureLive();
    } catch {
      setCaption(`${mode.toUpperCase()} konnte auf diesem Gerät nicht geöffnet werden.`);
      setPhase('error');
    }
  };

  const submitText = async (event) => {
    event.preventDefault();
    const text = textValue.trim();
    if (!text) return;
    setTextValue('');
    setHintVisible(false);
    companionRef.current?.recordMessage('user', text, 'text');
    setChatMessages(companionRef.current?.history?.(60) || []);
    setUserCaption(text);
    await ensureCamera();
    const realtime = realtimeRef.current;
    if (realtimeAvailable && realtime && !realtime.connected) {
      setPhase('connecting');
      try {
        await realtime.connect();
        realtime.sendPresence(presenceRef.current);
        setPhase('connected');
      } catch {
        setRealtimeAvailable(false);
      }
    }
    if (realtime?.connected) realtime.sendText(text);
    else await runLocalTurn(text, { recordUser: false });
  };

  const visualQuery = search;
  const portraitVisual = sessionMode === 'desktop' && (
    renderFallback
    || isPortraitSelection(visualQuery)
    || (!demoMode && !isExplicit3DSelection(visualQuery))
  );
  const live3DVisual = !portraitVisual;

  return (
    <div className={`alice-app phase-${phase} mode-${sessionMode} ${portraitVisual ? 'visual-canonical' : 'visual-3d'} ${callMode ? 'call-mode' : ''}`} ref={overlayRef}>
      <canvas ref={canvasRef} aria-label="Alice als dreidimensionale Begleiterin" />

      {portraitVisual && (
        <div className="canonical-alice-portrait" aria-label="Kanonische visuelle Identität von Alice">
          <img
            src="/alice-canonical.jpg"
            alt=""
            draggable="false"
            onError={(event) => {
              const image = event.currentTarget;
              if (!image.src.endsWith('/alice-mark.svg')) image.src = '/alice-mark.svg';
            }}
          />
        </div>
      )}

      <header className="presence-header">
        <div className="identity">
          <span className="identity-mark" aria-hidden="true" />
          <div><strong>Alice</strong><small>{demoMode ? 'visual lab · live' : live3DVisual ? 'verkörperte Präsenz · 3D' : 'Präsenzmodus'}</small></div>
        </div>
        <div className="live-state" role="status">
          <span className="state-pulse" aria-hidden="true" />
          {labels[phase] || phase}
        </div>
      </header>

      <section className={`captions ${caption || userCaption ? 'visible' : ''}`} aria-live="polite">
        {userCaption && <p className="user-caption">{userCaption}</p>}
        {caption && <p className="alice-caption">{caption}</p>}
      </section>

      {hintVisible && (
        <div className={`first-contact ${callMode ? 'call-contact' : ''}`}>
          {callMode ? (
            <button className="call-primary" type="button" onClick={ensureLive}>
              <span className="call-icon" aria-hidden="true">●</span>
              Alice anrufen
            </button>
          ) : (
            <p>Berühre Alice. Sprich einfach.</p>
          )}
          <small>{realtimeAvailable
            ? callMode
              ? 'Mikrofon und Kamera starten erst nach deinem Tippen.'
              : 'Kamera und Mikrofon beginnen erst nach deiner Berührung.'
            : localAIStatus === 'ready'
              ? 'Lokale KI läuft direkt auf diesem Gerät.'
              : 'Lokaler Basismodus: Der Live-KI-Kanal ist nicht verbunden.'}</small>
          {!realtimeAvailable && localAIStatus !== 'ready' && (
            <button
              className="local-ai-button"
              type="button"
              onClick={enableLocalAI}
              disabled={localAIStatus === 'loading' || localAISupported === false}
            >
              {localAIStatus === 'loading'
                ? `Lokale KI laden · ${localAIProgress}%`
                : localAISupported === false
                  ? 'Lokale KI braucht WebGPU'
                  : 'Lokale KI kostenlos laden'}
            </button>
          )}
        </div>
      )}

      {callMode && !hintVisible && (
        <div className="call-controls" aria-label="Alice Anruf">
          <button className="call-hangup" type="button" onClick={endCall}>Auflegen</button>
          <button className="call-text" type="button" onClick={() => setTextOpen((open) => !open)}>Schreiben</button>
        </div>
      )}

      {!hintVisible && !realtimeAvailable && localAIStatus !== 'ready' && (
        <div className="local-ai-entry">
          <button
            className="local-ai-button"
            type="button"
            onClick={enableLocalAI}
            disabled={localAIStatus === 'loading' || localAISupported === false}
          >
            {localAIStatus === 'loading'
              ? `Lokale KI laden · ${localAIProgress}%`
              : localAISupported === false
                ? 'Lokale KI braucht WebGPU'
                : 'Lokale KI kostenlos laden'}
          </button>
        </div>
      )}

      <div className="xr-entry" aria-label="Räumlichen Modus starten" hidden={callMode}>
        {xrSupport.ar && <button type="button" onClick={() => enterXR('ar')}>Alice in meinen Raum</button>}
        {xrSupport.vr && <button type="button" onClick={() => enterXR('vr')}>Alice im Labor</button>}
      </div>

      {textOpen && (
        <form className="text-fallback live-chat-panel" onSubmit={submitText}>
          <div className="live-chat-head">
            <div>
              <strong>Alice</strong>
              <span>Girl Companion · Livechat</span>
            </div>
            <button type="button" className="live-chat-close" onClick={() => setTextOpen(false)} aria-label="Livechat schließen">×</button>
          </div>
          <div className="live-chat-history" aria-live="polite">
            {chatMessages.length === 0 ? (
              <p className="live-chat-empty">Noch leer. Schreib Alice einfach.</p>
            ) : chatMessages.map((message) => (
              <div className={`live-chat-message ${message.role}`} key={message.id}>
                <small>{message.role === 'alice' ? 'Alice' : 'Du'}</small>
                <p>{message.text}</p>
              </div>
            ))}
          </div>
          <label htmlFor="alice-text">Nachricht</label>
          <div className="live-chat-compose">
            <input
              id="alice-text"
              autoFocus
              value={textValue}
              onChange={(event) => setTextValue(event.target.value)}
              placeholder="Sag Alice etwas …"
              autoComplete="off"
            />
            <button type="submit" aria-label="Senden">↗</button>
          </div>
        </form>
      )}

      <button className="text-key chat-key" type="button" onClick={() => setTextOpen((open) => !open)} aria-label="Texteingabe öffnen">
        Chat
      </button>
    </div>
  );
}
