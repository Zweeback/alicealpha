import { useEffect, useMemo, useRef, useState } from 'react';
import { TwinWorld } from './TwinWorld.js';
import { BOOT_DIALOGUE, LOCAL_FALLBACK_LABEL, TWINS, respondLocally } from './twinScript.js';
import { createVoiceDirector } from './twinVoice.js';
import './twins.css';

const MODEL_URL = '/avatars/alice-fbx-source.glb';
const MODEL_LABEL = 'Kandidat: FBX-Quelle, geriggt (nicht freigegeben)';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function Caption({ line }) {
  if (!line) return <p className="twins-caption-empty">Tippe auf „Start“. Sami beginnt.</p>;
  const parts = line.display.split(/(\*[^*]+\*)/g).filter(Boolean);
  return (
    <p className={`twins-caption-text ${line.speaker}`}>
      {parts.map((part, index) => (part.startsWith('*')
        ? <em key={index}>{part.replace(/\*/g, '')}</em>
        : <span key={index}>{part}</span>))}
    </p>
  );
}

export default function TwinsStudio() {
  const canvasRef = useRef(null);
  const worldRef = useRef(null);
  const voiceRef = useRef(null);
  const tokenRef = useRef(0);
  const mutedRef = useRef(false);

  const [model, setModel] = useState({ state: 'loading', detail: MODEL_LABEL });
  const [started, setStarted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [muted, setMuted] = useState(false);
  const [caption, setCaption] = useState(null);
  const [speaker, setSpeaker] = useState(null);
  const [log, setLog] = useState([]);
  const [replyLabel, setReplyLabel] = useState('');
  const [input, setInput] = useState('');
  const [voiceInfo, setVoiceInfo] = useState({ audio: false, distinct: false });

  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);

  useEffect(() => {
    const world = new TwinWorld(canvasRef.current);
    worldRef.current = world;
    if (import.meta.env.DEV) globalThis.__twinWorld = world; // dev-only hook for screenshot tests
    const voice = createVoiceDirector();
    voiceRef.current = voice;
    const syncVoices = () => setVoiceInfo({ audio: voice.audio, distinct: voice.voices.distinct });
    syncVoices();
    globalThis.speechSynthesis?.addEventListener?.('voiceschanged', syncVoices);

    world.load(MODEL_URL)
      .then((info) => {
        if (info) setModel({ state: 'ready', detail: `${MODEL_LABEL} · ${info.morphs} Morphs · Arme ${info.armsLowered ? 'gesenkt' : 'unverändert (T-Pose)'}` });
      })
      .catch((error) => {
        setModel({ state: 'error', detail: `Modell nicht geladen: ${error instanceof Error ? error.message : String(error)}` });
      });

    return () => {
      tokenRef.current += 1;
      voice.cancel();
      globalThis.speechSynthesis?.removeEventListener?.('voiceschanged', syncVoices);
      world.dispose();
      worldRef.current = null;
    };
  }, []);

  const play = async (lines) => {
    const world = worldRef.current;
    const voice = voiceRef.current;
    if (!world || !voice) return;
    const token = tokenRef.current + 1;
    tokenRef.current = token;
    setBusy(true);

    for (const line of lines) {
      if (tokenRef.current !== token) return;
      setCaption(line);
      setSpeaker(line.speaker);
      setLog((previous) => [...previous.slice(-9), line]);
      world.setSpeaker(line.speaker);
      world.setTwinState(line.speaker, { speaking: true, whisper: line.cues.includes('whisper'), viseme: 'rest' });

      await voice.speak(line, TWINS[line.speaker], {
        muted: mutedRef.current,
        onViseme: (viseme) => world.setTwinState(line.speaker, { viseme }),
        onGiggle: () => world.setTwinState(line.speaker, { giggleUntil: performance.now() + 1200 }),
      });

      world.setTwinState(line.speaker, { speaking: false, whisper: false, viseme: 'rest' });
      if (tokenRef.current !== token) return;
      await sleep(240);
    }

    if (tokenRef.current === token) {
      world.setSpeaker(null);
      setSpeaker(null);
      setBusy(false);
    }
  };

  const stop = () => {
    tokenRef.current += 1;
    voiceRef.current?.cancel();
    for (const id of Object.keys(TWINS)) worldRef.current?.setTwinState(id, { speaking: false, whisper: false, viseme: 'rest' });
    worldRef.current?.setSpeaker(null);
    setSpeaker(null);
    setBusy(false);
  };

  const start = () => {
    setStarted(true);
    setLog([]);
    setReplyLabel('Start-Dialog (fest hinterlegt)');
    play(BOOT_DIALOGUE);
  };

  const submit = (event) => {
    event.preventDefault();
    const text = input.trim();
    if (!text) return;
    setInput('');
    setStarted(true);
    const reply = respondLocally(text);
    setReplyLabel(reply.label);
    setLog((previous) => [...previous.slice(-9), { speaker: 'user', display: text }]);
    play(reply.lines);
  };

  const status = useMemo(() => {
    if (model.state === 'error') return 'FEHLER';
    if (model.state === 'loading') return 'LÄDT …';
    return busy ? 'SPRICHT' : 'BEREIT';
  }, [model.state, busy]);

  const voiceNote = voiceInfo.audio
    ? voiceInfo.distinct
      ? 'Zwei verschiedene Browser-Stimmen. Flüstern = leiser und langsamer, Kichern = kurzes „hihi“.'
      : 'Eine Browser-Stimme, Sami und Elisa unterscheiden sich nur in Tonhöhe und Tempo.'
    : 'Keine Browser-Stimme verfügbar oder Ton aus: nur Untertitel und Mundbewegung nach Zeitschätzung.';

  return (
    <div className="twins-shell" data-model-state={model.state} data-speaker={speaker || ''} data-busy={busy ? 'true' : 'false'}>
      <section className="twins-stage">
        <canvas ref={canvasRef} aria-label="Sami und Elisa, zwei Figuren" />
        <header className="twins-top">
          <div className="twins-brand"><strong>SAMI · ELISA</strong><span>ZWEI STIMMEN, EIN KONTEXT</span></div>
          <div className={`twins-badge ${model.state}`}>{status}</div>
        </header>
        <div className="twins-names">
          {Object.values(TWINS).map((twin) => (
            <div key={twin.id} className={`twins-tag ${twin.id}${speaker === twin.id ? ' active' : ''}`}>
              <b>{twin.label}</b><small>{twin.role}</small>
            </div>
          ))}
        </div>
        {model.state === 'error' && <div className="twins-error">{model.detail}</div>}
        {model.state === 'ready' && !started && (
          <button type="button" className="twins-start" onClick={start}>Start</button>
        )}
      </section>

      <section className="twins-panel">
        <div className="twins-caption" aria-live="polite">
          {caption && <b className={caption.speaker}>{TWINS[caption.speaker].label}</b>}
          <Caption line={caption} />
        </div>

        <ol className="twins-log">
          {log.map((line, index) => (
            <li key={`${index}-${line.display}`} className={line.speaker}>
              <b>{line.speaker === 'user' ? 'DU' : TWINS[line.speaker].label}</b>
              <span>{line.display}</span>
            </li>
          ))}
        </ol>

        <form className="twins-form" onSubmit={submit}>
          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Sag den beiden etwas …"
            aria-label="Nachricht an Sami und Elisa"
            enterKeyHint="send"
          />
          <button type="submit" className="primary" disabled={!input.trim() || model.state !== 'ready'}>Senden</button>
        </form>

        <div className="twins-controls">
          <button type="button" onClick={stop} disabled={!busy}>Stopp</button>
          <button type="button" onClick={start} disabled={model.state !== 'ready'}>Neu starten</button>
          <button type="button" className={muted ? 'on' : ''} onClick={() => setMuted((value) => !value)}>{muted ? 'Ton aus' : 'Ton an'}</button>
        </div>

        <p className="twins-note">
          {replyLabel && <><b>{replyLabel === LOCAL_FALLBACK_LABEL ? replyLabel.toUpperCase() : replyLabel.toUpperCase()}</b> · </>}
          {voiceNote}
        </p>
        <p className="twins-note dim">{model.detail}</p>
      </section>
    </div>
  );
}
