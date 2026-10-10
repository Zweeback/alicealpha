import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatronicBridge } from './core/animatronic.js';
import { CompanionStore } from './core/companion.js';
import { MemoryStore } from './core/memory.js';
import { PersonaRuntime } from './core/runtime.js';
import { createPerformancePlan } from './core/performance.js';
import { RealtimeChannel } from './core/realtime.js';
import { CameraPresence } from './core/vision.js';
import { VoiceChannel } from './core/voice.js';
import { TurnCoordinator } from './core/turnCoordinator.js';
import { AliceCheckpoint } from './core/lsCheckpoint.js';
import { LSMissionJournal } from './core/lsMissions.js';
import { createCapabilityFrame } from './core/lsCoordinator.js';
import { FORENSIC_CASES } from './core/lsForensics.js';
import { readLsLiveFeed } from './core/lsLiveFeed.js';
import { AliceWorld } from './xr/AliceWorld.js';
import { buildAvatarViewSearch, selectedAvatarView, shouldShowPortrait } from './xr/avatarCatalog.js';
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
  offline: 'Bereit · lokaler Modus',
  local: 'Lokale KI · auf diesem Gerät',
  error: 'Bereit · lokaler Modus',
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
  const turnsRef = useRef(new TurnCoordinator());
  const lsCheckpointRef = useRef(new AliceCheckpoint());
  const lsMissionsRef = useRef(new LSMissionJournal());
  const voiceModeRef = useRef('french');

  const [phase, setPhase] = useState('booting');
  const [caption, setCaption] = useState('');
  const [userCaption, setUserCaption] = useState('');
  const [sessionMode, setSessionMode] = useState('desktop');
  const [xrSupport, setXrSupport] = useState({ ar: false, vr: false });
  const [realtimeAvailable, setRealtimeAvailable] = useState(false);
  const [chatAvailable, setChatAvailable] = useState(false);
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
  const [voiceMode, setVoiceMode] = useState('french');
  const [lsOpen, setLsOpen] = useState(false);
  const [lsCheckpointState, setLsCheckpointState] = useState(null);
  const [lsMissions, setLsMissions] = useState([]);
  const [lsFeed, setLsFeed] = useState(null);
  const [lsFeedLoading, setLsFeedLoading] = useState(false);

  const recordLsCheckpoint = useCallback((stage, extras = {}) => {
    const next = lsCheckpointRef.current.save({stage, ...extras});
    setLsCheckpointState(next);
    return next;
  }, []);

  const refreshLsFeed = useCallback(async () => {
    setLsFeedLoading(true);
    try {
      setLsFeed(await readLsLiveFeed());
    } catch {
      setLsFeed({capturedAt: new Date().toISOString(), entries: [], source: 'unavailable'});
    } finally {
      setLsFeedLoading(false);
    }
  }, []);

  const openLs = useCallback(() => {
    lsMissionsRef.current.enqueue({ id: 'alice-hyperreal-clearance', title: 'Hyperreal Alice: Identität, Rig, Viseme', provider: 'copilot+jules' });
    lsMissionsRef.current.enqueue({ id: 'ls-cross-agent-loop', title: 'LS: Quellen → PR → CI → Review', provider: 'ls' });
    setLsMissions(lsMissionsRef.current.list());
    setLsCheckpointState(lsCheckpointRef.current.restore());
    setLsOpen(v=>!v);
    if (!lsOpen) void refreshLsFeed();
  }, [lsOpen, refreshLsFeed]);

  const setMode = useCallback((mode) => {
    sessionModeRef.current = mode;
    setSessionMode(mode);
    if (mode === 'ar') setCaption('Tippe auf eine Fläche, um Alice dort zu platzieren.');
  }, []);

  const selectVoiceMode = useCallback((mode) => {
    const selected = ['french', 'whisper', 'hev', 'glados'].includes(mode) ? mode : 'french';
    voiceModeRef.current = selected;
    setVoiceMode(selected);
    recordLsCheckpoint('ready', {voice:selected});
    voiceRef.current?.setMode(selected);
    worldRef.current?.setRepresentation(selected);
    realtimeRef.current?.setOutputMuted(true);
    realtimeRef.current?.sendModeContext?.(selected);
  }, []);

  const playVoiceProbe = useCallback(() => {
    const voice = voiceRef.current;
    if (!voice) return;
    turnsRef.current.cancel();
    fallbackBusyRef.current = false;
    realtimeRef.current?.interrupt();
    voice.stopSpeaking();
    worldRef.current?.stopPlan();
    worldRef.current?.setSpeechEnergy(0);
    setHintVisible(false);
    recordLsCheckpoint('thinking');

    if (!voice.canSpeak) {
      setCaption('Auf diesem Gerät ist keine Browser-Sprachausgabe verfügbar.');
      setPhase('ready');
      return;
    }

    const line = 'Bonjour. Ich bin Alice. Hier ist meine Stimme, und hier ist mein Körper.';
    const plan = createPerformancePlan(line, {}, 'greeting');
    setCaption(line);
    voice.speak(plan, {
      onStart: () => {
        setPhase('speaking');
        recordLsCheckpoint('speaking');
        worldRef.current?.playPlan(plan);
      },
      onEnd: () => {
        worldRef.current?.stopPlan();
        worldRef.current?.setSpeechEnergy(0);
        setPhase('ready');
        recordLsCheckpoint('ready');
      },
    });
  }, [recordLsCheckpoint]);

  const ensureCamera = useCallback(async () => {
    if (sessionModeRef.current !== 'desktop' || cameraRef.current?.running) return;
    try {
      await cameraRef.current?.start();
    } catch {
      // Eye contact still follows pointer or headset when camera access is declined.
    }
  }, []);

  const runLocalTurn = useCallback(async (text, { recordUser = true } = {}) => {
    if (!text) return;
    // Stop prior output before allowing a newer answer to speak.
    const turn = turnsRef.current.begin();
    voiceRef.current?.stopSpeaking();
    worldRef.current?.stopPlan();
    worldRef.current?.setSpeechEnergy(0);
    fallbackBusyRef.current = true;
    if (recordUser) {
      companionRef.current?.recordMessage('user', text, 'local-input');
      setChatMessages(companionRef.current?.history?.(60) || []);
    }
    setUserCaption(text);
    setPhase('thinking');
    recordLsCheckpoint('thinking');
    try {
      const result = await runtimeRef.current.respond(text, turn.signal);
      if (!turn.isCurrent()) return;
      setCompanionState(companionRef.current?.snapshot?.() || { sessionCount: 0, turnCount: 0 });
      setConfirmedMemoryCount(memoryRef.current?.confirmed?.().length || 0);
      companionRef.current?.recordMessage('alice', result.reply, result.source || 'local');
      setChatMessages(companionRef.current?.history?.(60) || []);
      setCaption(result.reply);
      // Only report actual speech once playback starts, not while TTS is loading.
      voiceRef.current?.speak(result.plan, {
        onStart: () => {
          if (!turn.isCurrent()) return;
          setPhase('speaking');
          recordLsCheckpoint('speaking');
          worldRef.current?.playPlan(result.plan);
          hardwareRef.current?.sendPlan(result.plan).catch(() => undefined);
        },
        onEnd: () => {
          if (!turn.isCurrent()) return;
          turn.finish();
          fallbackBusyRef.current = false;
          recordLsCheckpoint('ready', { completedTurns: (lsCheckpointRef.current.restore()?.completedTurns || 0) + 1 });
          worldRef.current?.stopPlan();
          worldRef.current?.setSpeechEnergy(0);
          setPhase(result.source?.startsWith('llm-router:')
            ? 'ready'
            : runtimeRef.current?.browserAIReady
              ? 'local'
              : 'offline');
        },
      });
    } catch {
      if (!turn.isCurrent()) return;
      turn.finish();
      fallbackBusyRef.current = false;
      recordLsCheckpoint('ready');
      worldRef.current?.stopPlan();
      worldRef.current?.setSpeechEnergy(0);
      setPhase(runtimeRef.current?.browserAIReady ? 'local' : 'offline');
      setCaption('Ich laufe lokal weiter.');
    }
  }, [recordLsCheckpoint]);

  const listenLocally = useCallback(async () => {
    const voice = voiceRef.current;
    if (!voice?.canListen) {
      setTextOpen(true);
      setPhase(runtimeRef.current?.endpoint === '/api/chat'
        ? 'ready'
        : runtimeRef.current?.browserAIReady
          ? 'local'
          : 'offline');
      return;
    }
    // A listening session interrupts any previous LLM request or spoken reply.
    turnsRef.current.cancel();
    voice.stopSpeaking();
    worldRef.current?.stopPlan();
    worldRef.current?.setSpeechEnergy(0);
    fallbackBusyRef.current = false;
    worldRef.current?.setSpeechEnergy(0);
    setCaption('');
    setUserCaption('');
    setPhase('listening');
    recordLsCheckpoint('listening');
    try {
      await runLocalTurn(await voice.listen());
    } catch (error) {
      setPhase(runtimeRef.current?.endpoint === '/api/chat'
        ? 'ready'
        : runtimeRef.current?.browserAIReady
          ? 'local'
          : 'offline');
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

    // The provider-neutral chat gateway is the default brain when available.
    // It reuses the existing browser speech channel and local avatar/memory runtime.
    if (chatAvailable) {
      await listenLocally();
      return;
    }

    const realtime = realtimeRef.current;
    if (realtimeAvailable && realtime && !realtime.connected) {
      setPhase('connecting');
      try {
        await realtime.connect();
        realtime.setOutputMuted(true);
        realtime.sendModeContext(voiceModeRef.current);
        realtime.sendPresence(presenceRef.current);
        setCaption('Ich bin da. Sprich einfach mit mir.');
        setPhase('connected');
        return;
      } catch (error) {
        setRealtimeAvailable(false);
        setCaption('Ich bin da. Ich laufe lokal weiter.');
        await listenLocally();
        return;
      }
    }
    if (realtime?.connected) {
      setCaption('Ich höre dir zu.');
      return;
    }
    await listenLocally();
  }, [chatAvailable, listenLocally, realtimeAvailable]);

  const endCall = useCallback(() => {
    turnsRef.current.cancel();
    recordLsCheckpoint('interrupted');
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
    setPhase(chatAvailable || realtimeAvailable ? 'ready' : runtimeRef.current?.browserAIReady ? 'local' : 'offline');
  }, [chatAvailable, realtimeAvailable]);

  useEffect(() => {
    interactRef.current = ensureLive;
  }, [ensureLive]);

  useEffect(() => {
    const previous = lsCheckpointRef.current.restore();
    if (previous) {
      if (['speaking','thinking','listening'].includes(previous.stage)) {
        recordLsCheckpoint('interrupted');
      } else {
        setLsCheckpointState(previous);
      }
      if (previous.voice && previous.voice !== 'french') {
        voiceModeRef.current = previous.voice;
        setVoiceMode(previous.voice);
      }
    }
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
    voice.setMode(voiceModeRef.current);
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
      world.init().then(() => {
        world.setRepresentation(voiceModeRef.current);
      }).catch((error) => {
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
        // A finished network response does not imply the browser voice is done.
        if (state === 'connected' && voice.speaking) return;
        if (state === 'disconnected' && phase !== 'booting') setPhase('offline');
        else if (labels[state]) setPhase(state);
      },
      onEvent: (event) => {
        if (event.type === 'input_audio_buffer.speech_started') {
          // User barge-in cancels browser TTS as well as local requests.
          turnsRef.current.cancel();
          voice.stopSpeaking();
          world.stopPlan();
          world.setSpeechEnergy(0);
          realtimeRef.current?.sendPresence(presenceRef.current);
        }
      },
      onTranscript: (text, done) => {
        setCaption(text);
        if (done && text?.trim()) {
          companion.recordMessage('alice', text, 'realtime');
          setChatMessages(companion.history(60));
          const plan = createPerformancePlan(text, {}, 'neutral');
          // Captions may arrive before audible output; never animate early.
          voice.speak(plan, {
            onStart: () => {
              setPhase('speaking');
              world.playPlan(plan);
            },
            onEnd: () => {
              world.stopPlan();
              world.setSpeechEnergy(0);
              setPhase('connected');
            },
          });
        }
      },
      onUserTranscript: (text, done) => {
        setUserCaption(text);
        if (done && text?.trim()) {
          companion.recordMessage('user', text, 'voice');
          setChatMessages(companion.history(60));
        }
      },
      // The Realtime remote audio is muted when browser TTS owns playback.
      onSpeechEnergy: (energy) => {
        if (!realtimeRef.current?.outputMuted) world.setSpeechEnergy(energy);
      },
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
        setRealtimeAvailable(false);
        setPhase(runtimeRef.current?.browserAIReady ? 'local' : 'offline');
        setCaption('Ich laufe lokal weiter.');
      },
    });
    realtime.setOutputMuted(true);
    realtimeRef.current = realtime;

    fetch('/api/health')
      .then((response) => response.ok ? response.json() : null)
      .then((health) => {
        // Client diagnostics: also require WebRTC capability
        const canWebRTC = Boolean(globalThis.RTCPeerConnection && navigator.mediaDevices?.getUserMedia);
        const available = Boolean(health?.realtime) && canWebRTC;
        const routedChat = Boolean(health?.chat?.operational);
        runtime.endpoint = routedChat
          ? '/api/chat'
          : health?.ollama
            ? '/api/local/respond'
            : null;
        setChatAvailable(routedChat);
        setRealtimeAvailable(available);
        voice.setNeuralTtsEnabled(Boolean(health?.tts));
        setPhase(routedChat || available ? 'ready' : health?.ollama ? 'local' : 'offline');
        if (routedChat) {
          const provider = health?.chat?.defaultProvider;
          setCaption(provider ? `Alice-Chatrouter verbunden · ${provider}` : 'Alice-Chatrouter verbunden.');
        } else if (!available && health?.ollama) {
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
      turnsRef.current.cancel();
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
    if (chatAvailable) {
      await runLocalTurn(text, { recordUser: false });
      return;
    }
    const realtime = realtimeRef.current;
    if (realtimeAvailable && realtime && !realtime.connected) {
      setPhase('connecting');
      try {
        await realtime.connect();
        realtime.setOutputMuted(true);
        realtime.sendModeContext(voiceModeRef.current);
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
  const portraitVisual = shouldShowPortrait(visualQuery, { sessionMode, renderFallback });
  const live3DVisual = !portraitVisual;
  const activeAvatarView = selectedAvatarView(search);
  const lsFrame = createCapabilityFrame({
    alice: {status:'partial',evidence:'3D preview deployed; identity/rig approval pending'},
    github: {status:'verified',evidence:'CI + Docker + avatar smoke successful on PR #112'},
    copilot: {status:'partial',evidence:'Copilot assignment on Issue #113 observed; output PR pending'},
    codespaces: {status:'partial',evidence:'Repository devcontainer exists; no running Codespace confirmed'},
    drive: {status:'partial',evidence:'ChatGPT Drive connector read succeeded; not a browser runtime API'},
    'chatgpt-library': {status:'partial',evidence:'Chat-scoped Files reads verified; separate from public Alice runtime'},
    metamorphose: {status:'partial',evidence:'Authenticated Charming getState/importBatch readback 47 questions'},
    library: {status:'verified',evidence:'Official public catalog: katalog.dortmund.de'},
  });

  return (
    <div className={`alice-app phase-${phase} mode-${sessionMode} ${portraitVisual ? 'visual-canonical' : 'visual-3d'} ${callMode ? 'call-mode' : ''}`} ref={overlayRef}>
      <canvas ref={canvasRef} aria-label="Alice als dreidimensionale Begleiterin" />

      {portraitVisual && (
        <div
          className="canonical-alice-portrait"
          role="button"
          tabIndex={0}
          aria-label="Mit Alice sprechen"
          onClick={ensureLive}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              ensureLive();
            }
          }}
        >
          <img
            src="/alice-reference.jpg"
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
          <div><strong>Alice</strong><small>{demoMode ? 'visual lab · live' : activeAvatarView === 'trellis' ? '3D Testmodell · ohne Gesicht-Rig' : live3DVisual ? 'Arbeitspartnerin · live 3D' : 'Arbeitspartnerin · Referenz'}</small></div>
        </div>
        <div className="live-state" role="status">
          <span className="state-pulse" aria-hidden="true" />
          {labels[phase] || phase}
        </div>
      </header>

      <button type="button" className="ls-launch" onClick={openLs} aria-expanded={lsOpen} aria-controls="ls-cockpit">LS · Leitstelle</button>
      {lsOpen && (
        <aside className="ls-cockpit" id="ls-cockpit" aria-label="LS Multi-LLM Capability Frame">
          <header><strong>LS · Capabilities & Clearance</strong><button type="button" onClick={() => setLsOpen(false)} aria-label="Leitstelle schließen">×</button></header>
          <p>VERIFIED ≠ LIVE-KI. Freigabe nur mit konkretem Laufzeit- und Prüfbeleg. Externe Abos erzeugen hier keine API-Verbindung.</p>
          <div className="ls-capability-list">
            {lsFrame.sources.map(item=><div key={item.id} className="ls-capability">
              <span>{item.label}</span><small data-status={item.status}>{item.status}</small>
            </div>)}
          </div>
          <h3>GitHub · Live-Missionsfeed</h3>
          <button type="button" className="ls-refresh" onClick={refreshLsFeed} disabled={lsFeedLoading}>
            {lsFeedLoading ? 'Quelle wird geprüft …' : 'Status aktualisieren'}
          </button>
          {lsFeed?.capturedAt && <p>Abfrage: {lsFeed.capturedAt} · Quelle: {lsFeed.source}</p>}
          {(lsFeed?.entries || []).map(item=><div key={item.id} className="ls-capability">
            <a href={item.url} target="_blank" rel="noopener noreferrer">{item.label}</a>
            <small data-status={item.checked ? 'verified' : 'blocked'}>{item.checked ? `${item.state}${item.assignees.length ? ' · '+item.assignees.join(', ') : ''}` : 'nicht geprüft'}</small>
          </div>)}
          <p>Das ist ein aktueller öffentlicher GitHub-Status, keine Bestätigung fertig erledigter Aufgaben.</p>
          <h3>Wiederaufnahme</h3>
          <p>{lsCheckpointState ? `Stand: ${lsCheckpointState.stage} · ${lsCheckpointState.completedTurns} abgeschlossene Turns · ${lsCheckpointState.voice}` : 'Kein gültiger lokaler Checkpoint vorhanden.'}</p>
          <h3>Missionen · lokal vorgemerkt</h3>
          {lsMissions.map(m => <div key={m.id} className="ls-capability"><span>{m.title}</span><small>{m.status}</small></div>)}
          <h3>Webforensik · offene Fälle</h3>
          <p>Persistentes Register: <a href="https://charm.ing/quick-raven-0017/bentropy-metamorphose" target="_blank" rel="noopener noreferrer">Bentropy Metamorphose öffnen</a>. Fragen und Quellen werden dort mit eigener Verlaufshistorie geführt.</p>
          {FORENSIC_CASES.map(m => <div key={m.id} className="ls-capability">
            <span>{m.title}</span><small>{m.status}</small>
          </div>)}
          <p>Atlas Earth ≠ Atlas AI; Buildy.so ≠ Buildly.io. Kein Fall ist allein aufgrund einer Ähnlichkeit bestätigt. Finanzansprüche erst mit Beleg.</p>
          <p>Keine automatische bezahlte API-Ausführung. Fortschritt erfordert Evidenz, Test und Review.</p>
        </aside>
      )}
      <nav className="voice-mode-switch" aria-label="Alice Sprachmodus">
        {[
          ['french', 'French'],
          ['whisper', 'Whisper'],
          ['hev', 'HEV'],
          ['glados', 'GLaDOS'],
        ].map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={voiceMode === id ? 'active' : ''}
            aria-pressed={voiceMode === id}
            onClick={() => selectVoiceMode(id)}
          >
            {label}
          </button>
        ))}
      </nav>

      <nav className="appearance-switch" aria-label="Alice Erscheinung" hidden={callMode || sessionMode !== 'desktop'}>
        {[
          ['procedural', '3D live'],
          ['trellis', '3D Test'],
          ['portrait', 'Referenz'],
        ].map(([id, label]) => (
          <button
            key={id}
            type="button"
            aria-pressed={activeAvatarView === id}
            className={activeAvatarView === id ? 'active' : ''}
            title={id === 'trellis' ? 'Experimenteller, noch nicht freigegebener 3D-Körper' : undefined}
            onClick={() => globalThis.location.assign(buildAvatarViewSearch(search, id))}
          >
            {label}
          </button>
        ))}
        <button type="button" className="voice-probe" title="Alice spricht einen kurzen Satz ohne Cloud-KI" onClick={playVoiceProbe}>
          <span aria-hidden="true">▶</span> Stimme testen
        </button>
      </nav>

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
            <p>Alice ist da. Sag ihr, woran wir jetzt arbeiten.</p>
          )}
          <small>{chatAvailable
            ? 'Standardpfad: Browser-Sprache → Alice-Chatrouter → Stimme + Avatar. Keine Kamera nötig.'
            : realtimeAvailable
            ? callMode
              ? 'Das Mikrofon startet erst nach deinem Tippen.'
              : 'Das Mikrofon beginnt erst nach deiner Berührung.'
            : localAIStatus === 'ready'
              ? 'Lokale KI läuft direkt auf diesem Gerät.'
              : 'Alice ist bereit. Live-KI wird automatisch genutzt, wenn verfügbar.'}</small>
          {!chatAvailable && !realtimeAvailable && localAIStatus !== 'ready' && (
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

      {!hintVisible && !chatAvailable && !realtimeAvailable && localAIStatus !== 'ready' && (
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
