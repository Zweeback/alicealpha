import { useEffect, useMemo, useRef, useState } from 'react';
import { NewsWorld } from './NewsWorld.js';
import './newsStudio.css';

const defaultScript = 'Guten Abend. Hier ist Parallax News. Ich bin Alice.';

function visemeFor(character) {
  const ch = String(character || '').toLowerCase();
  if ('aä'.includes(ch)) return 'A';
  if ('iıyj'.includes(ch)) return 'I';
  if ('uüw'.includes(ch)) return 'U';
  if ('eéè'.includes(ch)) return 'E';
  if ('oö'.includes(ch)) return 'O';
  return 'rest';
}

export default function NewsStudio() {
  const canvasRef = useRef(null);
  const worldRef = useRef(null);
  const visemeTimerRef = useRef(null);
  const [script, setScript] = useState(defaultScript);
  const [state, setState] = useState('IDLE');
  const [expression, setExpression] = useState('serious');
  const [asset, setAsset] = useState('procedural');
  const [look, setLook] = useState('anime');
  const [assetStatus, setAssetStatus] = useState('ANIME VTUBER');
  const [avatarStyle, setAvatarStyle] = useState('anime');

  const voices = useMemo(() => globalThis.speechSynthesis?.getVoices?.() || [], [state]);

  useEffect(() => {
    const world = new NewsWorld(canvasRef.current);
    worldRef.current = world;
    world.setAvatarStyle('anime');
    return () => {
      clearInterval(visemeTimerRef.current);
      globalThis.speechSynthesis?.cancel?.();
      world.dispose();
    };
  }, []);

  useEffect(() => {
    worldRef.current?.setExpression(expression);
  }, [expression]);

  useEffect(() => {
    worldRef.current?.setLook(look);
  }, [look]);

  useEffect(() => {
    if (asset !== 'procedural') return;
    worldRef.current?.setAvatarStyle(avatarStyle);
    setAssetStatus(avatarStyle === 'anime' ? 'ANIME VTUBER' : 'BROADCAST 3D');
  }, [avatarStyle, asset]);

  const stop = () => {
    globalThis.speechSynthesis?.cancel?.();
    clearInterval(visemeTimerRef.current);
    worldRef.current?.setViseme('rest');
    worldRef.current?.setSpeechEnergy(0);
    setState('IDLE');
  };

  const speak = () => {
    const text = script.trim();
    if (!text || !globalThis.speechSynthesis) return;

    stop();
    setState('ON AIR');
    worldRef.current?.playCue('present', 1100);

    let index = 0;
    visemeTimerRef.current = setInterval(() => {
      const char = text[index % Math.max(1, text.length)];
      index += 1;
      worldRef.current?.setViseme(visemeFor(char));
      worldRef.current?.setSpeechEnergy(/[a-zäöü]/i.test(char) ? 0.48 : 0.08);
    }, 72);

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'de-DE';
    utterance.rate = 0.94;
    utterance.pitch = 1.02;

    const preferred = voices.find((voice) => voice.lang?.startsWith('de') && /female|anna|katja|petra|google|microsoft/i.test(voice.name))
      || voices.find((voice) => voice.lang?.startsWith('de'))
      || voices[0];
    if (preferred) utterance.voice = preferred;

    utterance.onend = utterance.onerror = () => {
      clearInterval(visemeTimerRef.current);
      worldRef.current?.setViseme('rest');
      worldRef.current?.setSpeechEnergy(0);
      setState('IDLE');
    };

    globalThis.speechSynthesis.speak(utterance);
  };

  const selectAsset = async (value) => {
    setAsset(value);
    if (value === 'procedural') {
      worldRef.current?.setAvatarStyle(avatarStyle);
      setAssetStatus(avatarStyle === 'anime' ? 'ANIME VTUBER' : 'BROADCAST 3D');
      return;
    }

    const url = value === 'news-vrm' ? '/alice-news.vrm'
      : value === 'news-glb' ? '/alice-news.glb'
        : value === 'alice-vrm' ? '/alice.vrm'
          : '/alice.glb';

    setAssetStatus('LOADING');
    try {
      const result = await worldRef.current?.loadAsset(url);
      setAssetStatus(result?.vrm ? 'VRM LIVE' : 'GLB LIVE');
    } catch {
      setAssetStatus('MISSING → FALLBACK');
      setAsset('procedural');
    }
  };

  return (
    <main className="news-shell">
      <section className="news-stage">
        <canvas ref={canvasRef} aria-label="Alice als dynamische 3D-Nachrichtensprecherin" />
        <header className="news-topbar">
          <div className="news-brand">
            <strong>PARALLAX NEWS</strong>
            <span>ALICE · LIVE ANIME VTUBER</span>
          </div>
          <div className={`news-live ${state === 'ON AIR' ? 'active' : ''}`}>
            <i />
            <span>{state}</span>
          </div>
        </header>

        <div className="news-lower">
          <strong>ALICE</strong>
          <span>AI ANCHOR · ANIME VTUBER / VRM RUNTIME</span>
        </div>
      </section>

      <aside className="news-desk">
        <div className="news-heading">
          <div>
            <h1>Alice Live Studio</h1>
            <p>Dynamischer Anime-VTuber. Kein Standbild.</p>
          </div>
          <span className="news-badge">{assetStatus}</span>
        </div>

        <section className="news-panel">
          <label>Darstellung</label>
          <div className="news-grid two">
            <button
              type="button"
              className={avatarStyle === 'anime' ? 'selected' : ''}
              onClick={() => setAvatarStyle('anime')}
            >
              ANIME VTUBER
            </button>
            <button
              type="button"
              className={avatarStyle === 'broadcast' ? 'selected' : ''}
              onClick={() => setAvatarStyle('broadcast')}
            >
              BROADCAST 3D
            </button>
          </div>
        </section>

        <section className="news-panel">
          <label>Avatar-Asset</label>
          <select value={asset} onChange={(event) => selectAsset(event.target.value)}>
            <option value="alice-glb">/alice.glb · echter 3D-Kandidat</option>
            <option value="procedural">Prozedurale Alice · Fallback</option>
            <option value="news-vrm">/alice-news.vrm</option>
            <option value="news-glb">/alice-news.glb</option>
            <option value="alice-vrm">/alice.vrm</option>
            <option value="alice-glb">/alice.glb</option>
          </select>
        </section>

        <section className="news-panel">
          <label htmlFor="alice-script">Text für Alice</label>
          <textarea id="alice-script" rows="6" value={script} onChange={(event) => setScript(event.target.value)} />
          <div className="news-row">
            <button className="primary" type="button" onClick={speak}>ALICE SAGT</button>
            <button type="button" onClick={stop}>STOP</button>
          </div>
        </section>

        <section className="news-panel">
          <label>Ausdruck</label>
          <div className="news-grid four">
            {['serious', 'warm', 'amused', 'curious'].map((name) => (
              <button
                key={name}
                type="button"
                className={expression === name ? 'selected' : ''}
                onClick={() => setExpression(name)}
              >
                {name === 'serious' ? 'SERIÖS' : name === 'warm' ? 'WARM' : name === 'amused' ? 'AMÜSIERT' : 'NEUGIERIG'}
              </button>
            ))}
          </div>
        </section>

        <section className="news-panel">
          <label>Regie</label>
          <div className="news-grid three">
            <button type="button" onClick={() => worldRef.current?.playCue('nod')}>NICKEN</button>
            <button type="button" onClick={() => worldRef.current?.playCue('present')}>PRÄSENTIEREN</button>
            <button type="button" onClick={() => worldRef.current?.playCue('consider')}>NACHDENKEN</button>
            <button type="button" onClick={() => worldRef.current?.playCue('listen')}>ZUHÖREN</button>
          </div>
        </section>

        <div className="news-status">
          <span><i />3D runtime</span>
          <span><i />idle motion</span>
          <span><i />gaze</span>
          <span><i />speech</span>
          <span><i />A/I/U/E/O visemes</span>
          <span><i />VRM/GLB loader</span>
        </div>
      </aside>
    </main>
  );
}