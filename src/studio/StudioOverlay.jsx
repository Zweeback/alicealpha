import { useEffect, useMemo, useState } from 'react';
import './studio.css';

const DEFAULT_STORIES = [
  { kicker: 'PARALLAX NEWS', title: 'Die Nachrichten laufen weiter, während der Sender sich selbst weiterbaut.' },
  { kicker: 'AI', title: 'Alice übernimmt Anchor, Recherche und Übergaben im virtuellen Studio.' },
  { kicker: 'FIELD', title: 'Mobile Außenübertragung: GoPro, Pixel-Hotspot und resilienter Contribution-Stack.' },
  { kicker: 'FORMAT', title: 'Meine AI, deine AI: Zwei Nutzer tauschen ihre GPT-Instanzen.' },
  { kicker: 'SHOW', title: 'Ben & Bot: Late-Night, Einspieler, Produkte, Gäste und Live-Experimente.' },
];

const FORMATS = ['PARALLAX NEWS', 'MEINE AI, DEINE AI', 'BEN & BOT', 'BENAESTHESIA'];

export function StudioOverlay({
  phase = 'ready',
  caption = '',
  onCueAlice,
  onListen,
  realtimeAvailable = false,
}) {
  const [storyIndex, setStoryIndex] = useState(0);
  const [formatIndex, setFormatIndex] = useState(0);
  const [tickerOn, setTickerOn] = useState(true);
  const [clock, setClock] = useState(() => new Date());
  const [lowerThird, setLowerThird] = useState('ALICE · AI ANCHOR');
  const [locationLabel, setLocationLabel] = useState('DORTMUND · REGION');
  const [autoStory, setAutoStory] = useState(true);

  useEffect(() => {
    const timer = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!autoStory) return undefined;
    const timer = setInterval(() => {
      setStoryIndex((index) => (index + 1) % DEFAULT_STORIES.length);
    }, 9000);
    return () => clearInterval(timer);
  }, [autoStory]);

  const story = DEFAULT_STORIES[storyIndex];
  const status = useMemo(() => {
    if (phase === 'speaking') return 'ALICE ON AIR';
    if (phase === 'thinking') return 'RESEARCHING';
    if (phase === 'listening') return 'LISTENING';
    if (phase === 'error') return 'SIGNAL ERROR';
    return realtimeAvailable ? 'LIVE READY' : 'STUDIO READY';
  }, [phase, realtimeAvailable]);

  return (
    <div className="studio-shell" aria-label="beeninadream Studio">
      <div className="studio-topline">
        <div className="studio-brand">
          <span className="studio-dot" />
          <strong>beeninadream</strong>
          <span>PARALLAX NEWS</span>
        </div>
        <div className="studio-clock">
          <strong>{clock.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</strong>
          <span>{status}</span>
        </div>
      </div>

      <div className="studio-format-tabs" aria-label="Format">
        {FORMATS.map((format, index) => (
          <button
            key={format}
            className={index === formatIndex ? 'active' : ''}
            type="button"
            onClick={() => setFormatIndex(index)}
          >
            {format}
          </button>
        ))}
      </div>

      <aside className="studio-rundown">
        <div className="rundown-head">
          <span>RUNDOWN</span>
          <button type="button" onClick={() => setAutoStory((value) => !value)}>
            {autoStory ? 'AUTO' : 'HOLD'}
          </button>
        </div>
        {DEFAULT_STORIES.map((item, index) => (
          <button
            key={item.title}
            type="button"
            className={index === storyIndex ? 'current' : ''}
            onClick={() => setStoryIndex(index)}
          >
            <small>{String(index + 1).padStart(2, '0')} · {item.kicker}</small>
            <span>{item.title}</span>
          </button>
        ))}
      </aside>

      <div className="studio-story-card">
        <span className="story-kicker">{story.kicker}</span>
        <h1>{story.title}</h1>
        <div className="story-source">SOURCE DESK · VERIFIED / SIMULATED FEED</div>
      </div>

      <div className="studio-lower-third">
        <div className="lower-accent">LIVE</div>
        <div>
          <strong>{lowerThird}</strong>
          <span>{caption || 'Virtuelles Studio · dynamische Moderation · Quellen- und Live-System bereit'}</span>
        </div>
      </div>

      <div className="studio-map-inset">
        <div className="map-globe" aria-hidden="true">
          <span className="map-orbit orbit-a" />
          <span className="map-orbit orbit-b" />
          <span className="map-pin" />
        </div>
        <div>
          <strong>FIELD</strong>
          <span>{locationLabel}</span>
          <small>PUBLIC PRECISION · COARSE</small>
        </div>
      </div>

      <div className="studio-director">
        <button type="button" onClick={() => onCueAlice?.('welcome')}>CUE ALICE</button>
        <button type="button" onClick={() => onCueAlice?.('open_hands')}>EXPLAIN</button>
        <button type="button" onClick={() => onCueAlice?.('consider')}>ANALYSE</button>
        <button type="button" onClick={onListen}>GO LIVE</button>
        <button type="button" onClick={() => setTickerOn((value) => !value)}>TICKER</button>
      </div>

      {tickerOn && (
        <div className="studio-ticker">
          <strong>PARALLAX</strong>
          <div className="ticker-window">
            <span>
              NEWS · AI · LIVE RESEARCH · FIELD REPORTING · SYSTEMINTEGRATION · BEN & BOT · MEINE AI, DEINE AI · LUSTIGE PRODUKTE · PHILOSOPHIE ·
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
