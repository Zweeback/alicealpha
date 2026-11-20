import { useCallback, useEffect, useRef, useState } from 'react';
import { AvatarWorkbench } from '../avatar/AvatarWorkbench.js';
import { getGLTFLoader } from '../xr/loader.js';
import { getModelMetrics } from './modelMetrics.js';
import './aliceStudio.css';

const SOURCES = [
  { id: 'original', name: 'Alice · Original-VRM', path: 'avatars/alice-fbx-source.vrm', type: 'vrm' },
  { id: 'design', name: 'Alice · Designkandidat', path: 'avatars/alice-designsheet-candidate.vrm', type: 'vrm' },
  { id: 'glb', name: 'Alice · Quell-GLB', path: 'avatars/alice-fbx-source.glb', type: 'glb' },
];
const NO_METRICS = getModelMetrics(null);
const PANELS = [
  { name: 'Übersicht', glyph: '▦' }, { name: 'Avatar', glyph: '♙' },
  { name: 'Rig', glyph: '⌘' }, { name: 'Mimik', glyph: '◉' },
  { name: 'Animation', glyph: '♧' }, { name: 'Assets', glyph: '◇' },
  { name: 'Sprache', glyph: '♫' }, { name: 'KI', glyph: '✧' },
  { name: 'Export', glyph: '⇧' },
];
const modelURL = (path) => `${import.meta.env.BASE_URL}${path}`;

export default function AliceStudio() {
  const canvasRef = useRef(null);
  const workbenchRef = useRef(null);
  const currentLoadId = useRef(0);
  const [section, setSection] = useState('Übersicht');
  const [status, setStatus] = useState('Lade 3D-Umgebung …');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [source, setSource] = useState('Kein Modell geladen');
  const [metrics, setMetrics] = useState(NO_METRICS);
  const [parts, setParts] = useState([]);
  const [search, setSearch] = useState('');
  const [assetTab, setAssetTab] = useState('Alle');
  const [inspectorTab, setInspectorTab] = useState('Metadaten');
  const [stageTab, setStageTab] = useState('Vorschau');

  const syncModel = useCallback((type) => {
    const w = workbenchRef.current;
    if (!w?.model) return;
    setMetrics(getModelMetrics(w.model, w.vrm ?? null, type ?? w.type ?? 'unbekannt'));
    const next = [];
    w.model.traverse((object) => {
      if (object.isMesh) next.push({ id: object.uuid, name: object.name || 'Unbenanntes Mesh', visible: object.visible });
    });
    setParts(next);
  }, []);

  const loadBuiltIn = useCallback(async (item) => {
    const id = ++currentLoadId.current;
    setBusy(true);
    setError('');
    setStatus(`Lade ${item.name} …`);
    try {
      const response = await fetch(modelURL(item.path));
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${item.path}`);
      const bytes = await response.arrayBuffer();
      const gltf = await getGLTFLoader().parseAsync(bytes, '');
      if (id !== currentLoadId.current || !workbenchRef.current) return;
      const vrm = gltf.userData?.vrm ?? null;
      workbenchRef.current.setModel(vrm?.scene ?? gltf.scene, vrm, vrm ? 'vrm' : 'glb');
      setSource(item.name);
      setStatus(vrm ? 'VRM-Modell geladen' : '3D-Modell geladen (keine bestätigten VRM-Daten)');
      syncModel(vrm ? 'vrm' : 'glb');
    } catch (cause) {
      if (id !== currentLoadId.current) return;
      setStatus('Modell konnte nicht geladen werden');
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      if (id === currentLoadId.current) setBusy(false);
    }
  }, [syncModel]);

  useEffect(() => {
    try {
      workbenchRef.current = new AvatarWorkbench(canvasRef.current, () => {});
      void loadBuiltIn(SOURCES[0]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setStatus('WebGL-Initialisierung fehlgeschlagen');
    }
    return () => {
      currentLoadId.current += 1;
      workbenchRef.current?.dispose();
      workbenchRef.current = null;
    };
  }, [loadBuiltIn]);

  const onUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    ++currentLoadId.current;
    setBusy(true);
    setError('');
    try {
      await workbenchRef.current.loadFile(file);
      setSource(file.name);
      setStatus('Import abgeschlossen');
      syncModel(workbenchRef.current.type);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setStatus('Import fehlgeschlagen');
    } finally {
      setBusy(false);
      event.target.value = '';
    }
  };
  const toggleMesh = (id, visible) => {
    workbenchRef.current?.model?.traverse((object) => { if (object.uuid === id) object.visible = visible; });
    setParts((old) => old.map((part) => part.id === id ? { ...part, visible } : part));
  };
  const exportGLB = async () => {
    setError('');
    try {
      if (!workbenchRef.current?.model) throw new Error('Kein Modell geladen');
      const blob = await workbenchRef.current.exportGLB();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'alice-studio-export.glb';
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setStatus('GLB-Export erzeugt');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };
  const visibleAssets = SOURCES.filter((item) =>
    (assetTab === 'Alle' || (assetTab === 'VRM' ? item.type === 'vrm' : item.type === 'glb')) &&
    item.name.toLocaleLowerCase('de').includes(search.toLocaleLowerCase('de')),
  );

  return <main className="als" aria-label="Alice Studio">
    <header className="als-topbar">
      <a className="als-brand" href="./" aria-label="Alice Alpha Startseite"><span className="als-mark">A</span><span><small>OPEN ALICE PROJECT</small><strong>ALICE ALPHA</strong></span></a>
      <div className="als-title"><h1>Alice Studio</h1><p>3D-Avatar · VRM · Animation · Sprache · KI · Integration</p></div>
      <span className="als-project">Projekt: Alice Alpha</span><span className="als-chip">STUDIO / BETA</span>
    </header>
    <div className="als-shell">
      <nav className="als-nav" aria-label="Studio Navigation">
        <div className="als-nav-title">STUDIO</div>
        {PANELS.map((item) => <button key={item.name} className={section === item.name ? 'active' : ''} onClick={() => setSection(item.name)}><span aria-hidden="true">{item.glyph}</span>{item.name}</button>)}
        <div className="als-nav-bottom"><span className="als-mark small">A</span><b>ALICE ALPHA</b><small>Open Alice Project</small></div>
      </nav>
      <div className="als-overview">
        <section className="als-card als-project-card">
          <h2>Projektübersicht <span className="als-dots">•••</span></h2>
          <strong>Alice Alpha</strong><p>Interaktives 3D-Avatar-Studio</p>
          <div className="als-badge">Originalprojekt · lokale Assets</div>
          <dl className="als-metrics"><div><dt>Status</dt><dd>{status}</dd></div><div><dt>Quelle</dt><dd title={source}>{source}</dd></div><div><dt>Format</dt><dd>{metrics.vrm ? 'VRM erkannt' : metrics.meshes ? '3D-Szene' : 'Nicht geprüft'}</dd></div></dl>
        </section>
        <section className="als-card"><h2>Modellaudit</h2><dl className="als-metrics"><div><dt>Dreiecke</dt><dd>{metrics.meshes ? metrics.triangles.toLocaleString('de-DE') : '–'}</dd></div><div><dt>Meshes</dt><dd>{metrics.meshes || '–'}</dd></div><div><dt>Knochen</dt><dd>{metrics.bones || '–'}</dd></div><div><dt>Morph Targets</dt><dd>{metrics.morphTargets || '–'}</dd></div><div><dt>VRM-Expressions</dt><dd>{metrics.expressions ?? 'Unbekannt'}</dd></div></dl></section>
        <section className="als-card"><h2>Integrationen</h2><div className="als-mini-note">Bestehende Projektfunktionen bleiben separat erreichbar.</div><a className="als-link" href="./?viewer=vrm">↗ VRM Viewer</a><a className="als-link" href="./?studio=vrm-components">↗ Komponentenlabor</a><a className="als-link" href="./">↗ Alice Chat</a></section>
      </div>
      <section className="als-card als-assets" aria-label="Asset Browser">
        <h2>Asset Browser</h2><input aria-label="Assets suchen" placeholder="Assets suchen …" value={search} onChange={(e) => setSearch(e.target.value)} />
        <div className="als-pills">{['Alle', 'VRM', 'GLB'].map((tab) => <button key={tab} onClick={() => setAssetTab(tab)} className={tab === assetTab ? 'selected' : ''}>{tab}</button>)}</div>
        <div className="als-asset-list">{visibleAssets.map((asset) => <button key={asset.id} className="als-asset" disabled={busy} onClick={() => loadBuiltIn(asset)}><span className="als-asset-icon">{asset.type === 'vrm' ? '◈' : '⬡'}</span><span>{asset.name}</span><small>{asset.type.toUpperCase()}</small></button>)}</div>
        <label className="als-upload">＋ VRM / GLB importieren<input type="file" accept=".vrm,.glb" onChange={onUpload} disabled={busy}/></label>
        <div className="als-divider"/><h2>Meshes / Sichtbarkeit</h2><div className="als-meshes">{parts.length ? parts.map((part) => <label key={part.id}><input type="checkbox" checked={part.visible} onChange={(e) => toggleMesh(part.id, e.target.checked)} /><span title={part.name}>{part.name}</span></label>) : <p>Kein Modell geladen.</p>}</div>
      </section>
      <section className="als-center" aria-label="3D Vorschau">
        <div className="als-tabbar">{['Vorschau', 'Rig', 'Pose', 'Animation', 'Physik', 'QA'].map((tab) => <button className={tab === stageTab ? 'selected' : ''} key={tab} onClick={() => setStageTab(tab)}>{tab}</button>)}</div>
        <div className="als-stage"><canvas ref={canvasRef} aria-label="3D Modellansicht" /><div className="als-stage-state"><b>ALICE · 3D</b><span>{status}</span><span>{stageTab !== 'Vorschau' ? `${stageTab}: Informationen im Inspector` : 'Drehen: Ziehen · Zoom: Zwei Finger / Rad'}</span></div>{error && <div className="als-error" role="alert">{error}</div>}</div>
        <div className="als-timeline"><h2>Animation / Timeline <span>Aktive Clips: nicht verbunden</span></h2><div className="als-ruler">0s <span>2s</span><span>4s</span><span>6s</span><span>8s</span><span>10s</span></div>{['Bewegung', 'Mimik', 'Lippensynchronisation'].map((label) => <div className="als-track" key={label}><span>{label}</span><div title="Keine Timeline-Daten verbunden" /></div>)}<p>Timeline als Entwurf. Animationen werden hier erst nach Anschluss einer Clip-Engine angezeigt.</p></div>
      </section>
      <aside className="als-inspector" aria-label="Inspector">
        <section className="als-card"><div className="als-tabbar als-smalltabs">{['Metadaten', 'Materialien', 'Status'].map((tab) => <button key={tab} className={inspectorTab === tab ? 'selected' : ''} onClick={() => setInspectorTab(tab)}>{tab}</button>)}</div>
          {inspectorTab === 'Metadaten' ? <><h2>Avatar-Metadaten</h2><dl className="als-metrics"><div><dt>Name</dt><dd>{source}</dd></div><div><dt>Format</dt><dd>{metrics.vrm ? 'VRM' : 'GLB / unbekannt'}</dd></div><div><dt>VRM erkannt</dt><dd>{metrics.vrm ? 'Ja' : 'Nein / ungeprüft'}</dd></div></dl></> : inspectorTab === 'Materialien' ? <><h2>Materialien & Geometrie</h2><p>Meshes: {metrics.meshes}</p><p>Morph Targets: {metrics.morphTargets}</p></> : <><h2>Prüfstatus</h2><p>Rig-Validierung, Physik und Export nach VRM wurden hier noch nicht getestet.</p></>}
        </section>
        <section className="als-card"><h2>Sprache und KI</h2><dl className="als-metrics"><div><dt>Sprachchat</dt><dd>Über Alice Chat</dd></div><div><dt>Lippensynchronisation</dt><dd>Nicht verbunden</dd></div><div><dt>Gesichtstracking</dt><dd>Nicht verbunden</dd></div><div><dt>KI-Steuerung</dt><dd>Nicht verbunden</dd></div></dl><a className="als-link" href="./">↗ Zur Chat-Oberfläche</a></section>
        <section className="als-card"><h2>Physik & Simulation</h2><p className="als-mini-note">Keine simulierten Erfolgsanzeigen. Physikfunktionen erst nach Laufzeittest freigeben.</p></section>
        <section className="als-card als-export"><h2>Export / Werkzeuge</h2><div className="als-action-row"><button disabled={!metrics.meshes || busy} onClick={exportGLB}>⇩ GLB exportieren</button><button disabled={!metrics.meshes || busy} onClick={() => { workbenchRef.current?.resetPose(); setStatus('Pose zurückgesetzt'); }}>↶ Pose zurücksetzen</button></div><a className="als-link" href="./?viewer=vrm">↗ Im Viewer prüfen</a></section>
      </aside>
    </div>
    <footer className="als-footer"><span>ALICE ALPHA · OPEN ALICE PROJECT</span><span>LIVE-MODELLDATEN, KEINE ERFUNDENEN BENCHMARKS</span><span>Studio-Oberfläche · Beta</span></footer>
  </main>;
}
