import { useEffect, useMemo, useRef, useState } from 'react';
import { NewsWorld } from './NewsWorld.js';
import { CameraPresence } from '../core/vision.js';
import { buildScenePlan, parseStudioInput } from './newsPipeline.js';
import { createRenderQueue } from './renderQueue.js';
import './newsStudio.css';

const defaultScript = 'Guten Abend. Hier ist Parallax News. Ich bin Alice.';
const defaultArticleInput = `{
  "articles": [
    {
      "title": "Beispielmeldung",
      "body": "Hier kommt ein Artikel oder Rohtext hinein. Die Engine trennt ihn automatisch in sendefähige Moderationssegmente. Jedes Segment wird zu einer eigenen Alice-Szene mit Quelle, Evidenzstatus und Rendervertrag.",
      "source": "Redaktion",
      "evidence": "VERIFIED"
    }
  ]
}`;

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
  const presenceRef = useRef(null);
  const runTokenRef = useRef(0);

  const [script, setScript] = useState(defaultScript);
  const [articleInput, setArticleInput] = useState(defaultArticleInput);
  const [targetChars, setTargetChars] = useState(420);
  const [plan, setPlan] = useState(() => buildScenePlan(parseStudioInput(defaultArticleInput), { targetChars: 420 }));
  const [renderQueue, setRenderQueue] = useState(() => createRenderQueue(buildScenePlan(parseStudioInput(defaultArticleInput), { targetChars: 420 })));
  const [selectedScene, setSelectedScene] = useState(0);

  const [state, setState] = useState('IDLE');
  const [expression, setExpression] = useState('serious');
  const [asset, setAsset] = useState('alice-glb');
  const [look, setLook] = useState('anime');
  const [assetStatus, setAssetStatus] = useState('LOADING ALICE GLB');
  const [cameraStatus, setCameraStatus] = useState('CAMERA OFF');
  const [avatarStyle, setAvatarStyle] = useState('anime');

  const voices = useMemo(() => globalThis.speechSynthesis?.getVoices?.() || [], [state]);
  const activeScene = plan.scenes[selectedScene] || null;
  const totalSeconds = useMemo(
    () => plan.scenes.reduce((sum, scene) => sum + Number(scene.durationHintSeconds || 0), 0),
    [plan],
  );

  useEffect(() => {
    const world = new NewsWorld(canvasRef.current);
    worldRef.current = world;
    let cancelled = false;
    world.loadAsset('/alice.glb')
      .then((result) => {
        if (cancelled) return;
        setAsset('alice-glb');
        setAssetStatus(result?.vrm ? 'VRM LIVE' : 'GLB LIVE');
      })
      .catch(() => {
        if (cancelled) return;
        world.setAvatarStyle('anime');
        setAsset('procedural');
        setAssetStatus('3D FALLBACK LIVE');
      });
    return () => {
      cancelled = true;
      runTokenRef.current += 1;
      clearInterval(visemeTimerRef.current);
      globalThis.speechSynthesis?.cancel?.();
      presenceRef.current?.stop?.();
      presenceRef.current = null;
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

  const haltSpeech = () => {
    globalThis.speechSynthesis?.cancel?.();
    clearInterval(visemeTimerRef.current);
    worldRef.current?.setViseme('rest');
    worldRef.current?.setSpeechEnergy(0);
  };

  const stop = () => {
    runTokenRef.current += 1;
    haltSpeech();
    setState('IDLE');
  };

  const speakText = (text, onDone = () => {}) => {
    const spoken = String(text || '').trim();
    if (!spoken || !globalThis.speechSynthesis) {
      onDone();
      return;
    }

    haltSpeech();
    setState('ON AIR');
    worldRef.current?.playCue('present', 1100);

    let index = 0;
    visemeTimerRef.current = setInterval(() => {
      const char = spoken[index % Math.max(1, spoken.length)];
      index += 1;
      worldRef.current?.setViseme(visemeFor(char));
      worldRef.current?.setSpeechEnergy(/[a-zäöü]/i.test(char) ? 0.48 : 0.08);
    }, 72);

    const utterance = new SpeechSynthesisUtterance(spoken);
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
      onDone();
    };

    globalThis.speechSynthesis.speak(utterance);
  };

  const speak = () => {
    runTokenRef.current += 1;
    speakText(script, () => setState('IDLE'));
  };

  const selectScene = (index) => {
    const scene = plan.scenes[index];
    if (!scene) return;
    setSelectedScene(index);
    setScript(scene.script);
  };

  const runProgram = () => {
    if (!plan.scenes.length) return;
    const token = runTokenRef.current + 1;
    runTokenRef.current = token;

    const play = (index) => {
      if (runTokenRef.current !== token) return;
      const scene = plan.scenes[index];
      if (!scene) {
        setState('IDLE');
        return;
      }

      setSelectedScene(index);
      setScript(scene.script);
      speakText(scene.script, () => play(index + 1));
    };

    play(0);
  };

  const preparePipeline = async () => {
    stop();
    const articles = parseStudioInput(articleInput);
    const localPlan = buildScenePlan(articles, { targetChars });
    let nextPlan = localPlan;

    try {
      const response = await fetch('/api/news/prepare', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ articles, targetChars }),
      });
      if (response.ok) nextPlan = await response.json();
    } catch {
      // The deterministic browser pipeline is the offline fallback.
    }

    setPlan(nextPlan);
    setRenderQueue(createRenderQueue(nextPlan));
    setSelectedScene(0);
    setScript(nextPlan.scenes[0]?.script || '');
    setState('READY');
  };

  const exportPlan = () => {
    const blob = new Blob([JSON.stringify({ plan, renderQueue }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `parallax-news-run-${Date.now()}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
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

  const toggleCamera = async () => {
    if (presenceRef.current) {
      presenceRef.current.stop();
      presenceRef.current = null;
      setCameraStatus('CAMERA OFF');
      return;
    }

    const tracker = new CameraPresence({
      onPresence: (observation) => worldRef.current?.setPresence(observation),
      onError: () => setCameraStatus('TRACKING LIMITED'),
    });

    try {
      await tracker.start();
      presenceRef.current = tracker;
      setCameraStatus('FACE TRACKING');
    } catch {
      tracker.stop();
      setCameraStatus('CAMERA BLOCKED');
    }
  };

  return (
    <main className="news-shell">
      <section className="news-stage">
        <canvas ref={canvasRef} aria-label="Alice als dynamische 3D-Nachrichtensprecherin" />

        <header className="news-topbar">
          <div className="news-brand">
            <strong>PARALLAX NEWS</strong>
            <span>ALICE · DYNAMIC NEWS ENGINE</span>
          </div>
          <div className={`news-live ${state === 'ON AIR' ? 'active' : ''}`}>
            <i />
            <span>{state}</span>
          </div>
        </header>

        <div className="news-lower">
          <em>{activeScene?.lowerThird?.evidence || 'UNSET'}</em>
          <strong>{activeScene?.lowerThird?.headline || 'ALICE'}</strong>
          <span>{activeScene?.lowerThird?.source || 'AI ANCHOR · PARALLAX NEWS'}</span>
        </div>
      </section>

      <aside className="news-desk">
        <div className="news-heading">
          <div>
            <h1>Alice News Engine</h1>
            <p>Artikel rein → Segmente → Szenen → Alice → Render-Queue.</p>
          </div>
          <span className="news-badge">{assetStatus}</span>
        </div>

        <section className="news-panel pipeline-panel">
          <label htmlFor="article-input">Artikel / Rohtexte</label>
          <textarea
            id="article-input"
            className="article-input"
            rows="9"
            value={articleInput}
            onChange={(event) => setArticleInput(event.target.value)}
            spellCheck="false"
          />
          <div className="segment-control">
            <span>Segmentgröße</span>
            <input
              type="range"
              min="180"
              max="900"
              step="20"
              value={targetChars}
              onChange={(event) => setTargetChars(Number(event.target.value))}
            />
            <b>{targetChars}</b>
          </div>
          <div className="news-row">
            <button className="primary" type="button" onClick={preparePipeline}>PIPELINE BAUEN</button>
            <button type="button" onClick={exportPlan}>PLAN EXPORT</button>
          </div>
          <div className="pipeline-summary">
            <span>{plan.stories.length} ARTIKEL</span>
            <span>{plan.scenes.length} SZENEN</span>
            <span>~{Math.ceil(totalSeconds / 60)} MIN</span>
            <span>{renderQueue.jobs.length} RENDER-JOBS</span>
          </div>
        </section>

        <section className="news-panel">
          <label>Szenen / Moderationssegmente</label>
          <div className="scene-list">
            {plan.scenes.map((scene, index) => (
              <button
                type="button"
                key={scene.sceneId}
                className={index === selectedScene ? 'selected' : ''}
                onClick={() => selectScene(index)}
              >
                <b>{String(index + 1).padStart(2, '0')}</b>
                <span>
                  <strong>{scene.lowerThird.headline}</strong>
                  <small>{scene.segmentId} · {scene.durationHintSeconds}s</small>
                </span>
                <em>{scene.lowerThird.evidence}</em>
              </button>
            ))}
          </div>
          <div className="news-row">
            <button className="primary" type="button" onClick={runProgram}>SENDUNG STARTEN</button>
            <button type="button" onClick={stop}>STOP</button>
          </div>
        </section>

        <section className="news-panel">
          <label htmlFor="alice-script">Aktive Alice-Szene</label>
          <textarea id="alice-script" rows="6" value={script} onChange={(event) => setScript(event.target.value)} />
          <div className="news-row">
            <button className="primary" type="button" onClick={speak}>ALICE SAGT SZENE</button>
            <button type="button" onClick={stop}>STOP</button>
          </div>
        </section>

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
          </select>
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
            <button type="button" className={presenceRef.current ? 'selected' : ''} onClick={toggleCamera}>{cameraStatus}</button>
          </div>
        </section>

        <div className="news-status">
          <span><i />article ingest</span>
          <span><i />dynamic segmentation</span>
          <span><i />scene planner</span>
          <span><i />render queue</span>
          <span><i />A/I/U/E/O visemes</span>
          <span><i />VRM/GLB runtime</span>
        </div>
      </aside>
    </main>
  );
}
