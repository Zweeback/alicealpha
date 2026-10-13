import { useEffect, useRef, useState } from 'react';
import { createUiTelemetry } from './uiTelemetry.js';

const base = {
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  fontSize: 12,
  color: '#dcf5ed',
};
const button = {
  border: '1px solid #3f726f',
  background: '#132c2c',
  color: '#d9f6e9',
  borderRadius: 7,
  padding: '7px 10px',
  cursor: 'pointer',
  font: 'inherit',
};

export default function UITelemetryPanel() {
  const engineRef = useRef(null);
  if (!engineRef.current) engineRef.current = createUiTelemetry();
  const engine = engineRef.current;
  const [expanded, setExpanded] = useState(false);
  const [snapshot, setSnapshot] = useState(engine.getSnapshot());

  useEffect(() => {
    const unsubscribe = engine.subscribe(() => setSnapshot(engine.getSnapshot()));
    return () => { unsubscribe(); engine.stop(); };
  }, [engine]);

  function save() {
    const blob = new Blob([engine.exportJson()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'alice-uiux-telemetry-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const events = snapshot.events.slice(-28).reverse();
  return (
    <aside data-alice-telemetry-root="true" aria-label="UI- und UX-Live-Telemetrie" style={{
      ...base, position: 'fixed', right: 12, bottom: 12, zIndex: 2147483000,
      width: expanded ? 'min(440px, calc(100vw - 24px))' : 'auto',
      pointerEvents: 'auto',
    }}>
      {!expanded ? (
        <button type="button" onClick={() => setExpanded(true)} style={{
          ...button, background: '#0d2524', boxShadow: '0 4px 18px #0008',
          borderColor: snapshot.running ? '#41df9d' : '#56827a',
        }} aria-expanded={false}>
          <span style={{ color: snapshot.running ? '#56f3b0' : '#9eaaa9' }}>●</span>
          {' '}UI / UX TELEMETRY
          {snapshot.running ? ' · LIVE' : ' · AUS'}
        </button>
      ) : (
        <section style={{
          border: '1px solid #4b8d82', borderRadius: 12,
          background: '#081719', boxShadow: '0 8px 35px #000d',
          padding: 12, maxHeight: 'min(78dvh, 700px)', overflowY: 'auto',
        }}>
          <header style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <strong style={{ fontSize: 13, flex: 1 }}>📡 ALICE UI/UX INSPECTOR</strong>
            <span aria-live="polite" style={{ color: snapshot.running ? '#64e6a9' : '#f0cb85' }}>
              {snapshot.running ? '● LIVE' : '○ AUS'}
            </span>
            <button type="button" aria-label="Panel einklappen" onClick={() => setExpanded(false)} style={button}>−</button>
          </header>
          <p style={{ color: '#a9c7c2', lineHeight: 1.5, margin: '9px 0' }}>
            Beobachtet ausschließlich diese Alice-Seite. Startet nur mit deiner Freigabe.
            Keine Eingabetexte, Passwörter, Cookies oder Anfrageinhalte.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {!snapshot.running
              ? <button type="button" style={button} onClick={() => engine.start()}>▶ Aufnahme starten</button>
              : <button type="button" style={button} onClick={() => engine.stop()}>■ Aufnahme stoppen</button>}
            <button type="button" style={button} onClick={save}>↓ JSON exportieren</button>
            <button type="button" style={button} onClick={() => engine.clear()}>Leeren</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 6, marginTop: 12 }}>
            {[
              ['DOM-Änderungen', snapshot.counts.domChanges],
              ['Interaktionen', snapshot.counts.interactions],
              ['Ressourcen', snapshot.counts.resources],
              ['Navigationen', snapshot.counts.navigation],
              ['DOM geprüft', snapshot.sample?.inspected ?? '—'],
              ['Davon verborgen*', snapshot.sample?.hidden ?? '—'],
              ['iFrames gesehen', snapshot.sample?.frames ?? '—'],
              ['DOM-Stichprobe', snapshot.sample?.truncated ? 'Begrenzt' : 'Aktuell'],
            ].map(([label, value]) =>
              <div key={label} style={{ border: '1px solid #204344', padding: 8, borderRadius: 7 }}>
                <div style={{ color: '#a5c0bd', fontSize: 10 }}>{label}</div>
                <strong style={{ fontSize: 18 }}>{value}</strong>
              </div>
            )}
          </div>
          <p style={{ color: '#a9c7c2', fontSize: 10, lineHeight: 1.5 }}>
            * „Verborgen“ = CSS/ARIA/Inert-Merkmal, nicht Hinweis auf Absicht.
            Cross-Origin-iFrames, geschlossene Shadow-Roots, native App-Oberflächen,
            Server-, MCP- und Datenbankaktivität sind hier nicht einsehbar.
            Ressourcendauern enthalten nicht zwingend HTTP-Statuscodes.
          </p>
          <strong style={{ display: 'block', marginBottom: 7 }}>EREIGNISZEITACHSE ({snapshot.events.length})</strong>
          <div role="log" aria-live="off" style={{
            maxHeight: 225, overflowY: 'auto', background: '#061113',
            border: '1px solid #234547', borderRadius: 8,
          }}>
            {events.length === 0 && <div style={{ padding: 10, color: '#c9d7d2' }}>Noch keine Messdaten.</div>}
            {events.map((event, i) => (
              <div key={event.at + i} style={{ padding: 7, borderBottom: '1px solid #1c3738' }}>
                <div style={{ color: '#78d8b4' }}>{event.at.slice(11, 23)} · {event.type}</div>
                <div style={{ overflowWrap: 'anywhere', color: '#d2dfde' }}>
                  {Object.entries(event.details).map(([key, value]) => key + ': ' + String(value)).join(' · ')}
                </div>
              </div>
            ))}
          </div>
          <p style={{ color: '#a9c7c2', fontSize: 10, marginBottom: 0 }}>
            Nur flüchtiger Speicher, maximal 300 Ereignisse. Kein automatischer Upload.
            Daten werden beim Schließen/Neuladen verworfen, sofern du nicht exportierst.
          </p>
        </section>
      )}
    </aside>
  );
}
