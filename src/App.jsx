import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatronicBridge } from './core/animatronic.js';
import { MemoryStore } from './core/memory.js';
import { PersonaRuntime } from './core/runtime.js';
import { RealtimeChannel } from './core/realtime.js';
import { CameraPresence } from './core/vision.js';
import { VoiceChannel } from './core/voice.js';
import { AliceWorld } from './xr/AliceWorld.js';

const labels = {
  booting: 'Alice erwacht',
  ready: 'Bereit',
  connecting: 'Verbindung wird geöffnet',
  connected: 'Ich höre zu',
  listening: 'Ich höre zu',
  thinking: 'Ich denke nach',
  speaking: 'Alice spricht',
  offline: 'Privater Basismodus',
  error: 'Verbindung unterbrochen',
};

export default function App() {
  const canvasRef = useRef(null);
  const overlayRef = useRef(null);
  const worldRef = useRef(null);
  const cameraRef = useRef(null);
  const realtimeRef = useRef(null);
  const voiceRef = useRef(null);
  const memoryRef = useRef(null);
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
  const [textOpen, setTextOpen] = useState(false);
  const [textValue, setTextValue] = useState('');
  const [hintVisible, setHintVisible] = useState(true);

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

  const runLocalTurn = useCallback(async (text) => {
    if (!text || fallbackBusyRef.current) return;
    fallbackBusyRef.current = true;
    setUserCaption(text);
    setPhase('thinking');
    try {
      const result = await runtimeRef.current.respond(text);
      setCaption(result.reply);
      setPhase('speaking');
      worldRef.current?.playPlan(result.plan);
      hardwareRef.current?.sendPlan(result.plan).catch(() => undefined);
      voiceRef.current?.speak(result.plan, {
        onEnd: () => {
          fallbackBusyRef.current = false;
          setPhase('offline');
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
      setPhase('offline');
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
      setPhase('offline');
      if (error?.message !== 'aborted') setTextOpen(true);
    }
  }, [runLocalTurn]);

  const ensureLive = useCallback(async () => {
    setHintVisible(false);
    await ensureCamera();
    const realtime = realtimeRef.current;
    if (realtimeAvailable && realtime && !realtime.connected) {
      setPhase('connecting');
      try {
        await realtime.connect();
        realtime.sendPresence(presenceRef.current);
        setCaption('Ich bin da. Sprich einfach mit mir.');
        setPhase('connected');
        return;
      } catch {
        setRealtimeAvailable(false);
        setCaption('Der Live-Kanal ist nicht erreichbar. Ich bleibe im Basismodus bei dir.');
      }
    }
    if (realtime?.connected) {
      setCaption('Ich höre dir zu.');
      return;
    }
    await listenLocally();
  }, [ensureCamera, listenLocally, realtimeAvailable]);

  useEffect(() => {
    interactRef.current = ensureLive;
  }, [ensureLive]);

  useEffect(() => {
    const memory = new MemoryStore();
    const runtime = new PersonaRuntime(memory);
    const hardware = new AnimatronicBridge();
    const voice = new VoiceChannel({
      onListeningChange: (active) => active && setPhase('listening'),
      onSpeechEnergy: (energy) => worldRef.current?.setSpeechEnergy(energy),
    });
    memoryRef.current = memory;
    runtimeRef.current = runtime;
    hardwareRef.current = hardware;
    voiceRef.current = voice;

    const world = new AliceWorld(canvasRef.current, {
      overlayRoot: overlayRef.current,
      onInteract: () => interactRef.current?.(),
      onSessionChange: setMode,
    });
    worldRef.current = world;
    world.support().then(setXrSupport).catch(() => undefined);

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
      },
      onUserTranscript: (text) => setUserCaption(text),
      onSpeechEnergy: (energy) => world.setSpeechEnergy(energy),
      onTool: async (name, args) => {
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
        const available = Boolean(health?.realtime);
        setRealtimeAvailable(available);
        setPhase(available ? 'ready' : 'offline');
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
      world.dispose();
    };
  }, [setMode]);

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
    setTextOpen(false);
    setHintVisible(false);
    setUserCaption(text);
    await ensureCamera();
    if (realtimeRef.current?.connected) realtimeRef.current.sendText(text);
    else await runLocalTurn(text);
  };

  return (
    <div className={`alice-app phase-${phase} mode-${sessionMode}`} ref={overlayRef}>
      <canvas ref={canvasRef} aria-label="Alice als lebendige dreidimensionale Begleiterin" />

      <header className="presence-header">
        <div className="identity">
          <span className="identity-mark" aria-hidden="true" />
          <div><strong>Alice</strong><small>Persona Core · {sessionMode.toUpperCase()}</small></div>
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
        <div className="first-contact">
          <p>Berühre Alice. Danach kannst du einfach sprechen.</p>
          <small>Kamera und Mikrofon beginnen erst nach deiner Berührung.</small>
        </div>
      )}

      <div className="xr-entry" aria-label="Räumlichen Modus starten">
        {xrSupport.ar && <button type="button" onClick={() => enterXR('ar')}>Alice in meinen Raum</button>}
        {xrSupport.vr && <button type="button" onClick={() => enterXR('vr')}>Alice im Labor</button>}
      </div>

      {textOpen && (
        <form className="text-fallback" onSubmit={submitText}>
          <label htmlFor="alice-text">Mit Alice schreiben</label>
          <div>
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

      <button className="text-key" type="button" onClick={() => setTextOpen((open) => !open)} aria-label="Texteingabe öffnen">
        T
      </button>
    </div>
  );
}
