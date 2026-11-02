// ALICE Asset Viewer – lädt alle Assets aus assets/manifest.json (VRM-Avatare, GLB-Modelle, Umgebungen).
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';

const $ = (s) => document.querySelector(s); const qs = new URLSearchParams(location.search);
const renderer = new THREE.WebGLRenderer({ canvas: $('#c'), antialias: true, preserveDrawingBuffer: qs.has('test') });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x0b1118);
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture; scene.environmentIntensity = 0.55;
const key = new THREE.DirectionalLight(0xfff1e6, 2.2); key.position.set(-2, 4, 3); key.castShadow = true; key.shadow.mapSize.set(2048, 2048);
Object.assign(key.shadow.camera, { left: -3, right: 3, top: 3, bottom: -1 }); key.shadow.bias = -0.0004; scene.add(key);
const rim = new THREE.DirectionalLight(0x6fe8ff, 1.5); rim.position.set(2, 2, -2.5); scene.add(rim);
const floor = new THREE.Mesh(new THREE.CircleGeometry(4, 64), new THREE.MeshStandardMaterial({ color: 0x1a2430, roughness: 0.85 }));
floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 2000); camera.position.set(0, 1.4, 3.2);
const controls = new OrbitControls(camera, renderer.domElement); controls.target.set(0, 1.0, 0); controls.enableDamping = true;
const composer = new EffectComposer(renderer); composer.addPass(new RenderPass(scene, camera));
const gtao = new GTAOPass(scene, camera, innerWidth, innerHeight); gtao.blendIntensity = 0.8; composer.addPass(gtao); composer.addPass(new OutputPass());
function resize() { renderer.setSize(innerWidth, innerHeight, false); composer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();

const loader = new GLTFLoader(); loader.register((p) => new VRMLoaderPlugin(p));
let current = null, vrm = null, env = null, manifest = null, t = 0, blinkT = 0;
const status = (s) => ($('#status').textContent = s);

function frameObject(obj, isAvatar) {
  const box = new THREE.Box3().setFromObject(obj); const size = box.getSize(new THREE.Vector3()); const c = box.getCenter(new THREE.Vector3());
  if (isAvatar) { controls.target.set(0, size.y * 0.55, 0); camera.position.set(0, size.y * 0.6, size.y * 1.9); }
  else { const r = size.length(); controls.target.copy(c); camera.position.copy(c).add(new THREE.Vector3(r * 0.35, r * 0.25, r * 0.6)); }
  camera.near = Math.max(0.02, size.length() / 500); camera.far = size.length() * 20 + 100; camera.updateProjectionMatrix();
}

async function loadAsset(a) {
  status('Lade ' + a.name + ' …');
  const gltf = await loader.loadAsync('assets/' + a.file);
  if (a.kind === 'environment') {
    if (env) scene.remove(env); env = gltf.scene; env.traverse((o) => { if (o.isMesh) { o.receiveShadow = true; o.castShadow = true; } });
    scene.add(env); floor.visible = false;
    if (!current) frameObject(env, false); else { env.position.set(0, 0, -40); }
    status(a.name + ' geladen'); return;
  }
  if (current) { scene.remove(current); if (vrm) VRMUtils.deepDispose(current); }
  vrm = gltf.userData.vrm || null; current = vrm ? vrm.scene : gltf.scene;
  if (vrm) VRMUtils.rotateVRM0(vrm);
  current.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; } });
  scene.add(current); frameObject(current, a.kind === 'avatar'); if (env) env.position.set(0, 0, -40);
  buildExpr(); $('#info').textContent = a.notes || '';
  status(a.name + (vrm ? ` · ${Object.keys(vrm.expressionManager.expressionMap).length} Expressions` : ''));
}

function buildExpr() {
  const box = $('#expr'); box.innerHTML = ''; if (!vrm) return;
  const pick = ['neutral', 'happy', 'angry', 'sad', 'relaxed', 'surprised', 'curious', 'thinking', 'excited', 'serious', 'confused', 'playful', 'aa', 'oh', 'blink'];
  for (const n of pick.filter((n) => vrm.expressionManager.getExpression(n))) {
    const b = document.createElement('button'); b.textContent = n;
    b.onclick = () => { for (const k of Object.keys(vrm.expressionManager.expressionMap)) vrm.expressionManager.setValue(k, 0); if (n !== 'neutral') vrm.expressionManager.setValue(n, 1); };
    box.appendChild(b);
  }
}

function pose() {
  if (!vrm || !$('#relax').checked) return; const h = vrm.humanoid; const r = (n, x, y, z) => { const b = h.getNormalizedBoneNode(n); if (b) b.rotation.set(x, y, z); };
  r('leftUpperArm', 0, 0, -1.2); r('rightUpperArm', 0, 0, 1.2); r('leftLowerArm', 0, -0.2, 0); r('rightLowerArm', 0, 0.2, 0);
  r('spine', Math.sin(t * 1.6) * 0.012, Math.sin(t * 0.4) * 0.03, 0); r('head', Math.sin(t * 0.7) * 0.02, Math.sin(t * 0.3) * 0.08, 0);
  blinkT -= 1 / 60; if (blinkT < 0) blinkT = 3 + Math.random() * 3; const k = blinkT < 0.15 ? Math.sin((blinkT / 0.15) * Math.PI) : 0;
  if (vrm.expressionManager.getExpression('blink')) vrm.expressionManager.setValue('blink', Math.max(k, vrm.expressionManager.getValue('blink') > 0.99 ? 1 : 0));
}

const clock = new THREE.Clock();
(function loop() { const dt = Math.min(clock.getDelta(), 0.05); t += dt; pose(); if (vrm) vrm.update(dt); controls.update(); if (qs.has('lite')) renderer.render(scene, camera); else composer.render(); if (!qs.has('test')) requestAnimationFrame(loop); else setTimeout(loop, 250); })();

manifest = await (await fetch('assets/manifest.json')).json();
const sel = $('#asset');
for (const [i, a] of manifest.assets.entries()) { const o = document.createElement('option'); o.value = i; o.textContent = `${a.kind === 'avatar' ? '👤' : a.kind === 'environment' ? '🏥' : '📦'} ${a.name}`; sel.appendChild(o); }
sel.onchange = () => loadAsset(manifest.assets[+sel.value]).catch((e) => status('Fehler: ' + e.message));
$('#bgEnv').onclick = () => { const e = manifest.assets.find((a) => a.kind === 'environment'); if (e) loadAsset(e); };
$('#clearEnv').onclick = () => { if (env) { scene.remove(env); env = null; floor.visible = true; } };
const start = manifest.assets.findIndex((a) => a.default) ?? 0; sel.value = Math.max(0, start);
await loadAsset(manifest.assets[+sel.value]).catch((e) => status('Fehler: ' + e.message));
window.__viewer = { loadAsset, manifest, get vrm() { return vrm; }, THREE, scene };
