import { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { getGLTFLoader } from '../xr/loader.js';
import './vrmViewer.css';

export const BUILT_IN_VRM = import.meta.env.BASE_URL + 'avatars/alice-fbx-source.vrm';
const SOURCE_GLB = import.meta.env.BASE_URL + 'avatars/alice-fbx-source.glb';
const EXPRESSIONS = [
  'neutral', 'happy', 'cheerful', 'smile', 'curious', 'surprised',
  'sad', 'blink', 'blinkLeft', 'blinkRight', 'aa', 'ih', 'ou', 'ee', 'oh', 'jawOpen',
];

function inspect(gltf, vrm, model) {
  const bounds = new THREE.Box3().setFromObject(model);
  if (bounds.isEmpty() || !Number.isFinite(bounds.min.x) || bounds.getSize(new THREE.Vector3()).length() === 0) {
    throw new Error('Die Datei enthält keine darstellbare 3D-Geometrie.');
  }
  const meshes = new Set(), bones = new Set(), morphNames = new Set();
  let triangles = 0;
  model.traverse((object) => {
    if (object.isBone) bones.add(object);
    if (!object.isMesh) return;
    meshes.add(object);
    const geom = object.geometry;
    triangles += geom.index ? geom.index.count / 3 : (geom.attributes.position?.count || 0) / 3;
    Object.keys(object.morphTargetDictionary || {}).forEach((name) => morphNames.add(name));
  });
  const manager = vrm?.expressionManager;
  const expressions = vrm
    ? EXPRESSIONS.filter((name) => Boolean(manager?.getExpression?.(name)))
    : EXPRESSIONS.filter((name) => morphNames.has(name));
  return {
    meshes: meshes.size, bones: bones.size, triangles: Math.round(triangles),
    morphTargets: morphNames.size, animations: gltf.animations?.length || 0,
    vrm: Boolean(vrm), expressions, bounds,
  };
}

function frameCamera(runtime, direction = 'front') {
  if (!runtime?.model) return;
  const box = new THREE.Box3().setFromObject(runtime.model);
  const centre = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const height = Math.max(size.y, 0.01);
  const radius = Math.max(height * 1.35, size.x * 2.1, size.z * 2.5, 1.4);
  const camera = runtime.camera;
  const distance = Math.max(radius, (height / 2) / Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5)) * 1.25);
  const focus = centre.clone().add(new THREE.Vector3(0, height * 0.025, 0));
  const vector = direction === 'back' ? new THREE.Vector3(0, 0, -1)
    : direction === 'side' ? new THREE.Vector3(1, 0, 0)
      : new THREE.Vector3(0, 0, 1);
  runtime.controls.target.copy(focus);
  camera.position.copy(focus).addScaledVector(vector, distance);
  camera.near = Math.max(distance / 1000, 0.005);
  camera.far = Math.max(distance * 100, 150);
  camera.updateProjectionMatrix();
  runtime.controls.minDistance = Math.max(height * .3, .15);
  runtime.controls.maxDistance = Math.max(height * 12, 15);
  runtime.controls.update();
  runtime.grid.position.y = box.min.y - 0.005;
}

export default function VRMViewer() {
  const canvasRef = useRef(null);
  const runtimeRef = useRef(null);
  const loadIdRef = useRef(0);
  const [status, setStatus] = useState('Lade ALICE VRM …');
  const [error, setError] = useState('');
  const [info, setInfo] = useState(null);
  const [expression, setExpression] = useState('neutral');
  const [turntable, setTurntable] = useState(false);
  const [grid, setGrid] = useState(true);
  const [fileName, setFileName] = useState('alice-fbx-source.vrm');
  const [loading, setLoading] = useState(true);

  const loadBytes = useCallback(async (bytes, name) => {
    const request = ++loadIdRef.current;
    setLoading(true);
    setError('');
    setStatus('Prüfe und lade 3D-Modell …');
    let gltf;
    let vrmParsingError;
    try {
      gltf = await getGLTFLoader().parseAsync(bytes, '');
    } catch (cause) {
      vrmParsingError = cause;
      try {
        gltf = await new GLTFLoader().parseAsync(bytes, '');
      } catch (fallbackCause) {
        if (request !== loadIdRef.current) return;
        setLoading(false);
        setStatus('Modell konnte nicht geladen werden');
        setError(String(fallbackCause?.message || vrmParsingError?.message || fallbackCause));
        return;
      }
    }
    if (request !== loadIdRef.current || !runtimeRef.current) return;
    const runtime = runtimeRef.current;
    const vrm = gltf.userData?.vrm || null;
    const model = vrm?.scene || gltf.scene || gltf.scenes?.[0];
    if (!model) {
      setError('Keine Scene im geladenen glTF.');
      setLoading(false);
      return;
    }
    let result;
    try {
      result = inspect(gltf, vrm, model);
    } catch (cause) {
      setError(String(cause.message || cause));
      setLoading(false);
      return;
    }

    if (runtime.model) runtime.scene.remove(runtime.model);
    runtime.scene.add(model);
    model.traverse((object) => {
      if (object.isMesh) {
        object.frustumCulled = false;
        object.castShadow = true;
      }
    });
    runtime.model = model;
    runtime.vrm = vrm;
    runtime.gltf = gltf;
    runtime.expressionNames = result.expressions;
    frameCamera(runtime);
    setInfo({
      meshes: result.meshes, bones: result.bones, triangles: result.triangles,
      morphTargets: result.morphTargets, animations: result.animations,
      vrm: result.vrm, expressions: result.expressions,
      degraded: Boolean(vrmParsingError),
    });
    setExpression('neutral');
    setFileName(name);
    setLoading(false);
    setStatus(vrm ? 'VRM 1.0 · 3D-Modell geladen' : 'GLB-Rohansicht · VRM-Runtime nicht aktiv');
  }, []);

  const loadBundled = useCallback(async (url, name) => {
    const request = ++loadIdRef.current;
    setLoading(true);
    setError('');
    setStatus('Lade ' + name + ' …');
    try {
      const response = await fetch(url, { cache: 'no-store' });
      if (!response.ok) throw new Error('HTTP ' + response.status + ' · ' + url);
      const bytes = await response.arrayBuffer();
      if (request !== loadIdRef.current) return;
      await loadBytes(bytes, name);
    } catch (cause) {
      if (request !== loadIdRef.current) return;
      setLoading(false);
      setStatus('Datei nicht verfügbar');
      setError(String(cause?.message || cause));
    }
  }, [loadBytes]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let renderer, observer;
    let disposed = false;
    try {
      const scene = new THREE.Scene();
      scene.background = new THREE.Color('#0d101a');
      const camera = new THREE.PerspectiveCamera(34, 1, .01, 200);
      camera.position.set(0, 1.2, -4);
      const webgl = new THREE.WebGLRenderer({
        canvas, antialias: true, alpha: false, preserveDrawingBuffer: true,
        powerPreference: 'high-performance',
      });
      renderer = webgl;
      webgl.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 2));
      webgl.outputColorSpace = THREE.SRGBColorSpace;
      webgl.toneMapping = THREE.ACESFilmicToneMapping;
      webgl.toneMappingExposure = 1.23;
      webgl.shadowMap.enabled = true;
      const controls = new OrbitControls(camera, canvas);
      controls.enableDamping = true;
      controls.dampingFactor = .07;
      controls.enablePan = true;
      controls.autoRotateSpeed = 1.3;
      controls.target.set(0, 1, 0);
      controls.update();

      scene.add(new THREE.HemisphereLight(0xe8ecff, 0x271c39, 2.6));
      const key = new THREE.DirectionalLight(0xfff5eb, 3.2);
      key.position.set(-3, 5, -4);
      scene.add(key);
      const fill = new THREE.DirectionalLight(0x7fc7ff, 2.0);
      fill.position.set(3, 2, 3);
      scene.add(fill);
      const rim = new THREE.DirectionalLight(0xbc83ff, 2.4);
      rim.position.set(1, 3, 4);
      scene.add(rim);
      const gridHelper = new THREE.GridHelper(12, 24, 0x8f81ae, 0x252638);
      gridHelper.position.y = 0;
      scene.add(gridHelper);
      const runtime = { scene, camera, renderer: webgl, controls, grid: gridHelper, model: null, vrm: null };
      runtimeRef.current = runtime;
      const resize = () => {
        if (disposed) return;
        const rect = canvas.getBoundingClientRect();
        const width = Math.max(1, Math.floor(rect.width));
        const height = Math.max(1, Math.floor(rect.height));
        webgl.setSize(width, height, false);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
      };
      observer = new ResizeObserver(resize);
      observer.observe(canvas);
      resize();
      const clock = new THREE.Clock();
      webgl.setAnimationLoop(() => {
        if (disposed) return;
        const delta = Math.min(clock.getDelta(), 0.1);
        runtime.vrm?.update(delta);
        controls.update();
        webgl.render(scene, camera);
      });
      loadBundled(BUILT_IN_VRM, 'alice-fbx-source.vrm');
    } catch (cause) {
      setError('WebGL konnte nicht gestartet werden: ' + String(cause?.message || cause));
      setLoading(false);
    }
    return () => {
      disposed = true;
      loadIdRef.current++;
      observer?.disconnect();
      renderer?.setAnimationLoop(null);
      runtimeRef.current?.controls?.dispose();
      renderer?.dispose();
      runtimeRef.current = null;
    };
  }, [loadBundled]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    runtime.controls.autoRotate = turntable;
    runtime.grid.visible = grid;
  }, [turntable, grid]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime?.model) return;
    const manager = runtime.vrm?.expressionManager;
    if (manager) {
      for (const name of runtime.expressionNames) {
        manager.setValue(name, name === expression && name !== 'neutral' ? 1 : 0);
      }
    } else {
      runtime.model.traverse((obj) => {
        if (!obj.isMesh || !obj.morphTargetDictionary || !obj.morphTargetInfluences) return;
        for (const name of runtime.expressionNames) {
          const index = obj.morphTargetDictionary[name];
          if (Number.isInteger(index)) obj.morphTargetInfluences[index] = name === expression ? 1 : 0;
        }
      });
    }
  }, [expression, info]);

  async function onFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!/\.(vrm|glb)$/i.test(file.name)) {
      setError('Nur echte .vrm- oder .glb-Dateien sind erlaubt.');
      event.target.value = '';
      return;
    }
    if (file.size > 150 * 1024 * 1024) {
      setError('Datei zu groß (Maximum 150 MB).');
      event.target.value = '';
      return;
    }
    await loadBytes(await file.arrayBuffer(), file.name);
    event.target.value = '';
  }

  function screenshot() {
    const runtime = runtimeRef.current;
    if (!runtime?.model) return;
    runtime.renderer.render(runtime.scene, runtime.camera);
    runtime.renderer.domElement.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'alice-vrm-review.png';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, 'image/png');
  }

  return (
    <main className="vrm-viewer-shell">
      <header className="vrm-top">
        <div>
          <span className="vrm-overline">CHARACTER LAB · ALICE / VRM 1.0</span>
          <h1>ALICE <em>3D Viewer</em></h1>
          <p>Original-Mesh · Live-Inspektion · kein Ersatzavatar</p>
        </div>
        <a href="./" className="vrm-back">← ALICE Hauptansicht</a>
      </header>
      <section className="vrm-workspace">
        <div className="vrm-stage" aria-label="Interaktive 3D-Modellansicht von ALICE">
          <canvas ref={canvasRef} aria-label="ALICE 3D Viewer, mit Maus oder Touch drehbar" />
          <div className="vrm-stage-top">
            <span className={'vrm-led ' + (loading || error ? 'busy' : 'ok')} />
            <span role="status">{status}</span>
          </div>
          {error && <div className="vrm-error" role="alert">{error}</div>}
          <div className="vrm-stage-bottom">Ziehen: drehen · Zwei Finger/Mausrad: zoomen · Rechtsklick: verschieben</div>
        </div>
        <aside className="vrm-controls">
          <section className="vrm-panel">
            <h2>Modell</h2>
            <div className="vrm-filename">{fileName}</div>
            <p className="vrm-helper">Eigener VRM-1.0-Kandidat. Nicht als kanonische ALICE freigegeben.</p>
            <div className="vrm-action-grid">
              <button type="button" disabled={loading} onClick={() => loadBundled(BUILT_IN_VRM, 'alice-fbx-source.vrm')}>VRM laden</button>
              <button type="button" disabled={loading} onClick={() => loadBundled(SOURCE_GLB, 'alice-fbx-source.glb')}>Quell-GLB</button>
            </div>
            <label className="vrm-upload">
              Eigene .vrm / .glb öffnen
              <input type="file" accept=".vrm,.glb,model/gltf-binary" onChange={onFile} />
            </label>
          </section>
          <section className="vrm-panel">
            <h2>Kamera</h2>
            <div className="vrm-action-grid">
              <button type="button" disabled={!info} onClick={() => frameCamera(runtimeRef.current, 'front')}>Vorne</button>
              <button type="button" disabled={!info} onClick={() => frameCamera(runtimeRef.current, 'side')}>Seite</button>
              <button type="button" disabled={!info} onClick={() => frameCamera(runtimeRef.current, 'back')}>Hinten</button>
              <button type="button" disabled={!info} onClick={screenshot}>PNG speichern</button>
            </div>
            <label className="vrm-toggle"><input type="checkbox" checked={turntable} onChange={(event) => setTurntable(event.target.checked)} /> Drehteller</label>
            <label className="vrm-toggle"><input type="checkbox" checked={grid} onChange={(event) => setGrid(event.target.checked)} /> Bodengitter</label>
          </section>
          <section className="vrm-panel">
            <h2>Mimik</h2>
            {!info && <p className="vrm-helper">Wird nach dem Laden geprüft.</p>}
            {info && info.expressions.length === 0 && <p className="vrm-helper">Keine kompatiblen Expressions vom Loader bereitgestellt.</p>}
            <div className="vrm-expressions">
              {info?.expressions.map((name) => (
                <button type="button" key={name} className={expression === name ? 'active' : ''}
                  onClick={() => setExpression(name)}>{name}</button>
              ))}
            </div>
          </section>
          <section className="vrm-panel">
            <h2>Audit · tatsächliche Modelldaten</h2>
            <dl className="vrm-audit">
              <div><dt>Format</dt><dd>{info ? (info.vrm ? 'VRM 1.0' : 'glTF 2.0 Rohansicht') : '–'}</dd></div>
              <div><dt>Meshes</dt><dd>{info?.meshes ?? '–'}</dd></div>
              <div><dt>Bones</dt><dd>{info?.bones ?? '–'}</dd></div>
              <div><dt>Dreiecke</dt><dd>{info?.triangles?.toLocaleString('de-DE') ?? '–'}</dd></div>
              <div><dt>Morphnamen</dt><dd>{info?.morphTargets ?? '–'}</dd></div>
              <div><dt>Animationsclips</dt><dd>{info?.animations ?? '–'}</dd></div>
            </dl>
            {info?.degraded && <p className="vrm-warning">VRM-Plugin meldete einen Fehler. Angezeigt wird nur die GLB-Rohgeometrie.</p>}
            <p className="vrm-helper">Design-Übereinstimmung, Skin-Deformation und Gesichtsausdrücke sind erst nach Sichtprüfung bestätigt.</p>
          </section>
        </aside>
      </section>
    </main>
  );
}
