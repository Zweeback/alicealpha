import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { VRMUtils } from '@pixiv/three-vrm';
import { getGLTFLoader } from '../xr/loader.js';
import './aliceStage.css';

// The private model is never committed (see .gitignore: public/private/).
// It only exists in local builds / access-protected preview deployments.
// Without it the stage falls back to the public repository candidate.
const PRIVATE_VRM = import.meta.env.BASE_URL + 'private/alice.vrm';
const FALLBACK_VRM = import.meta.env.BASE_URL + 'avatars/alice-fbx-source.vrm';

async function loadFirst(urls) {
  let lastError;
  for (const url of urls) {
    try {
      const response = await fetch(url, { cache: 'no-cache' });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      const type = response.headers.get('content-type') || '';
      if (type.includes('text/html')) throw new Error('kein Modell unter ' + url);
      return await response.arrayBuffer();
    } catch (cause) {
      lastError = cause;
    }
  }
  throw lastError || new Error('Kein Modell gefunden');
}

function relaxArms(vrm) {
  const humanoid = vrm.humanoid;
  const set = (name, z) => {
    const bone = humanoid?.getNormalizedBoneNode?.(name);
    if (bone) bone.rotation.z = z;
  };
  set('leftUpperArm', -1.18);
  set('rightUpperArm', 1.18);
  set('leftLowerArm', -0.12);
  set('rightLowerArm', 0.12);
}

export default function AliceStage() {
  const canvasRef = useRef(null);
  const [state, setState] = useState('loading');

  useEffect(() => {
    const canvas = canvasRef.current;
    let disposed = false;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#0b0c10');
    const camera = new THREE.PerspectiveCamera(28, 1, 0.05, 50);

    scene.add(new THREE.HemisphereLight(0xeef0ff, 0x1a1720, 2.2));
    const key = new THREE.DirectionalLight(0xfff4ea, 2.6);
    key.position.set(1.2, 2.4, 2.6);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xb9a6ff, 1.6);
    rim.position.set(-1.5, 2.2, -2);
    scene.add(rim);

    // Soft floor glow instead of a grid.
    const glow = new THREE.Mesh(
      new THREE.CircleGeometry(0.9, 48),
      new THREE.MeshBasicMaterial({ color: 0x2a2540, transparent: true, opacity: 0.55 }),
    );
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = 0.001;
    scene.add(glow);

    const lookTarget = new THREE.Object3D();
    scene.add(lookTarget);
    const pointer = new THREE.Vector2(0, 0);
    const smoothPointer = new THREE.Vector2(0, 0);
    const onPointer = (event) => {
      const point = event.touches?.[0] || event;
      pointer.set((point.clientX / innerWidth) * 2 - 1, -((point.clientY / innerHeight) * 2 - 1));
    };
    addEventListener('pointermove', onPointer, { passive: true });
    addEventListener('touchmove', onPointer, { passive: true });

    let vrm = null;
    let headBase = null;
    let focus = new THREE.Vector3(0, 1.3, 0);

    const frame = () => {
      const width = Math.max(1, canvas.clientWidth);
      const height = Math.max(1, canvas.clientHeight);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      // Portrait screens: show the full figure; landscape: knees-up framing.
      const portrait = camera.aspect < 0.8;
      const span = portrait ? 1.85 : 1.25;
      const centreY = portrait ? 0.9 : 1.1;
      const distance = (span / 2) / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
      focus = new THREE.Vector3(0, centreY, 0);
      camera.position.set(0, centreY + 0.08, distance);
      camera.lookAt(focus);
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(frame);
    observer.observe(canvas);
    frame();

    const clock = new THREE.Clock();
    let elapsed = 0;
    let nextBlink = 2.2;
    renderer.setAnimationLoop(() => {
      if (disposed) return;
      const delta = Math.min(clock.getDelta(), 0.1);
      elapsed += delta;
      if (vrm) {
        smoothPointer.lerp(pointer, Math.min(1, delta * 4));
        const head = vrm.humanoid?.getNormalizedBoneNode?.('head');
        const chest = vrm.humanoid?.getNormalizedBoneNode?.('upperChest') || vrm.humanoid?.getNormalizedBoneNode?.('chest');
        const breath = Math.sin(elapsed * 1.6);
        if (chest) chest.rotation.x = breath * 0.012;
        if (head) {
          if (!headBase) headBase = head.rotation.clone();
          head.rotation.set(
            headBase.x + Math.sin(elapsed * 0.7) * 0.02 - smoothPointer.y * 0.12,
            headBase.y + Math.sin(elapsed * 0.37) * 0.03 + smoothPointer.x * 0.22,
            headBase.z + Math.sin(elapsed * 0.5) * 0.012,
          );
        }
        vrm.scene.position.y = breath * 0.003;
        // Blink via expressions, random interval.
        let blink = 0;
        const t = elapsed - nextBlink;
        if (t >= 0) {
          blink = t < 0.08 ? t / 0.08 : t < 0.22 ? 1 - (t - 0.08) / 0.14 : 0;
          if (t >= 0.22) nextBlink = elapsed + 2.5 + Math.random() * 3.5;
        }
        vrm.expressionManager?.setValue('blink', blink);
        lookTarget.position.set(smoothPointer.x * 0.9, 1.45 + smoothPointer.y * 0.5, 1.2);
        vrm.update(delta);
      }
      renderer.render(scene, camera);
    });

    loadFirst([PRIVATE_VRM, FALLBACK_VRM])
      .then((bytes) => getGLTFLoader().parseAsync(bytes, ''))
      .then((gltf) => {
        if (disposed) return;
        vrm = gltf.userData?.vrm;
        if (!vrm) throw new Error('Datei enthält kein VRM');
        VRMUtils.removeUnnecessaryVertices?.(gltf.scene);
        VRMUtils.rotateVRM0?.(vrm);
        const box = new THREE.Box3().setFromObject(vrm.scene);
        const h = box.getSize(new THREE.Vector3()).y;
        if (h > 0 && Math.abs(h - 1.6) > 0.5) vrm.scene.scale.multiplyScalar(1.6 / h);
        vrm.scene.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
        relaxArms(vrm);
        if (vrm.lookAt) vrm.lookAt.target = lookTarget;
        scene.add(vrm.scene);
        setState('ready');
      })
      .catch((cause) => {
        console.error(cause);
        if (!disposed) setState('error');
      });

    return () => {
      disposed = true;
      observer.disconnect();
      removeEventListener('pointermove', onPointer);
      removeEventListener('touchmove', onPointer);
      renderer.setAnimationLoop(null);
      renderer.dispose();
    };
  }, []);

  return (
    <main className="alice-stage" data-state={state}>
      <canvas ref={canvasRef} className="alice-stage-canvas" aria-label="Alice" />
      {state === 'loading' && <div className="alice-stage-hint">Alice kommt …</div>}
      {state === 'error' && <div className="alice-stage-hint">Alice konnte nicht geladen werden.</div>}
    </main>
  );
}
