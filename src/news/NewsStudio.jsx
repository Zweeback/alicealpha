import { useMemo, useState } from 'react';
import { buildScenePlan, parseStudioInput } from './newsPipeline.js';
import './NewsStudio.css';

const EXAMPLE = `{
  "articles": [
    {
      "title": "Beispielmeldung",
      "body": "Hier kommt der Artikeltext hinein. Alice liest später nicht einfach alles vor, sondern erhält daraus getrennte Moderationssegmente.",
      "source": "Quelle",
      "evidence": "VERIFIED"
    }
  ]
}`;

export default function NewsStudio() {
  const [input, setInput] = useState(EXAMPLE);
  const [targetChars, setTargetChars] = useState(420);
  const [plan, setPlan] = useState(() => buildScenePlan(parseStudioInput(EXAMPLE), { targetChars: 420 }));
  const [selectedScene, setSelectedScene] = useState(0);

  const active = plan.scenes[selectedScene] || null;
  const totalSeconds = useMemo(
    () => plan.scenes.reduce((sum, scene) => sum + Number(scene.durationHintSeconds || 0), 0),
    [plan],
  );

  const prepare = async () => {
    const articles = parseStudioInput(input);
    const localPlan = buildScenePlan(articles, { targetChars });
    setPlan(localPlan);
    setSelectedScene(0);

    try {
      const response = await fetch('/api/news/prepare', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ articles, targetChars }),
      });
      if (response.ok) setPlan(await response.json());
    } catch {
      // Local deterministic plan remains usable if the server is unavailable.
    }
  };

  const exportPlan = () => {
    const blob = new Blob([JSON.stringify(plan, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `alice-news-run-${Date.now()}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const copyScript = async () => {
    if (!active?.script) return;
    await navigator.clipboard?.writeText(active.script);
  };

  return (
    <main className="news-studio">
      <header className="news-studio__topbar">
        <div>
          <span className="news-studio__eyebrow">BEN & ALICE</span>
          <h1>News Studio</h1>
        </div>
        <div className="news-studio__stats">
          <span>{plan.stories.length} Artikel</span>
          <span>{plan.scenes.length} Szenen</span>
          <span>~{Math.round(totalSeconds / 60)} min</span>
        </div>
      </header>

      <section className="news-studio__grid">
        <aside className="news-studio__panel news-studio__input">
          <div className="news-studio__panel-head">
            <strong>01 · INPUT</strong>
            <small>Text oder JSON</small>
          </div>
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            spellCheck="false"
            aria-label="Artikel oder Texte"
          />
          <label>
            Segmentgröße
            <input
              type="range"
              min="180"
              max="900"
              step="20"
              value={targetChars}
              onChange={(event) => setTargetChars(Number(event.target.value))}
            />
            <span>{targetChars} Zeichen</span>
          </label>
          <div className="news-studio__actions">
            <button type="button" onClick={prepare}>Pipeline bauen</button>
            <button type="button" className="ghost" onClick={exportPlan}>Plan exportieren</button>
          </div>
        </aside>

        <section className="news-studio__panel news-studio__timeline">
          <div className="news-studio__panel-head">
            <strong>02 · SEGMENTE</strong>
            <small>dynamisch getrennt</small>
          </div>
          <div className="news-studio__scene-list">
            {plan.scenes.map((scene, index) => (
              <button
                key={scene.sceneId}
                type="button"
                className={index === selectedScene ? 'active' : ''}
                onClick={() => setSelectedScene(index)}
              >
                <span className="scene-index">{String(index + 1).padStart(2, '0')}</span>
                <span className="scene-copy">
                  <strong>{scene.lowerThird.headline}</strong>
                  <small>{scene.segmentId} · {scene.durationHintSeconds}s</small>
                </span>
                <span className={`evidence evidence--${String(scene.lowerThird.evidence || '').toLowerCase()}`}>
                  {scene.lowerThird.evidence}
                </span>
              </button>
            ))}
          </div>
        </section>

        <section className="news-studio__panel news-studio__preview">
          <div className="news-studio__panel-head">
            <strong>03 · STUDIO</strong>
            <small>Alice Presenter Layer</small>
          </div>
          <div className="news-studio__monitor">
            <iframe
              title="Alice Talking Head"
              src="/?embed=talking-head&visual=3d&avatar=glb"
              allow="autoplay; microphone"
            />
            <div className="news-studio__lower-third">
              <span>{active?.lowerThird?.evidence || 'UNSET'}</span>
              <strong>{active?.lowerThird?.headline || 'Keine Szene'}</strong>
              <small>{active?.lowerThird?.source || 'Quelle noch nicht gesetzt'}</small>
            </div>
          </div>

          <div className="news-studio__script">
            <div className="news-studio__script-head">
              <strong>Moderation</strong>
              <button type="button" className="ghost" onClick={copyScript}>Text kopieren</button>
            </div>
            <p>{active?.script || 'Noch keine Szene ausgewählt.'}</p>
          </div>

          <div className="news-studio__contract">
            <div><span>CAM</span><strong>{active?.camera || '—'}</strong></div>
            <div><span>VOICE</span><strong>{active?.render?.voice || '—'}</strong></div>
            <div><span>LIPSYNC</span><strong>{active?.render?.lipSync || '—'}</strong></div>
            <div><span>BG</span><strong>{active?.render?.background || '—'}</strong></div>
          </div>
        </section>
      </section>
    </main>
  );
}
