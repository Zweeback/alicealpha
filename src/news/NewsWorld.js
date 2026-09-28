import * as THREE from 'three';
import { getGLTFLoader } from '../xr/loader.js';

function damp(current, target, lambda, dt) {
  return THREE.MathUtils.damp(current, target, lambda, dt);
}

function tube(points, radius, material) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
  const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 24, radius, 8, false), material);
  mesh.castShadow = true;
  return mesh;
}

function capsule(radius, length, material) {
  const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(radius, length, 8, 18), material);
  mesh.castShadow = true;
  return mesh;
}

function createAnchorAlice(style = 'anime') {
  const root = new THREE.Group();
  const anime = style === 'anime';

  const materials = {
    skin: new THREE.MeshStandardMaterial({ color: anime ? '#f0c4b6' : '#e6b6a4', roughness: anime ? 0.46 : 0.56 }),
    skinShadow: new THREE.MeshStandardMaterial({ color: '#c98d7b', roughness: 0.62 }),
    hair: new THREE.MeshStandardMaterial({ color: '#8d2a20', roughness: 0.7 }),
    hairDark: new THREE.MeshStandardMaterial({ color: '#431510', roughness: 0.78 }),
    jacket: new THREE.MeshStandardMaterial({ color: '#e7e6e2', roughness: 0.78 }),
    dark: new THREE.MeshStandardMaterial({ color: '#202229', roughness: 0.55, metalness: 0.08 }),
    eye: new THREE.MeshStandardMaterial({ color: '#f4f4f0', roughness: 0.3 }),
    iris: new THREE.MeshStandardMaterial({ color: anime ? '#72b7d8' : '#669db0', roughness: anime ? 0.24 : 0.34, emissive: anime ? '#12324a' : '#000000', emissiveIntensity: anime ? 0.18 : 0 }),
    mouth: new THREE.MeshStandardMaterial({ color: '#8f4b52', roughness: 0.66 }),
  };

  const hips = new THREE.Mesh(new THREE.SphereGeometry(0.43, 30, 22), materials.dark);
  hips.scale.set(1, 0.58, 0.72);
  hips.position.y = -0.08;
  root.add(hips);

  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.48, 0.94, 36), materials.jacket);
  torso.position.y = 0.42;
  torso.scale.z = 0.72;
  torso.castShadow = true;
  root.add(torso);

  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.18, 0.28, 24), materials.skin);
  neck.position.y = 1.0;
  root.add(neck);

  const head = new THREE.Group();
  head.position.y = 1.38;
  head.scale.setScalar(1.10);
  root.add(head);

  const hairBack = new THREE.Mesh(new THREE.SphereGeometry(0.48, 40, 30), materials.hairDark);
  hairBack.scale.set(0.92, 1.12, 0.78);
  head.add(hairBack);

  const face = new THREE.Mesh(new THREE.SphereGeometry(anime ? 0.45 : 0.42, 44, 34), materials.skin);
  face.scale.set(anime ? 0.86 : 0.82, anime ? 1.02 : 1.05, anime ? 0.66 : 0.69);
  face.position.z = 0.17;
  face.castShadow = true;
  head.add(face);

  const hairCap = new THREE.Mesh(new THREE.SphereGeometry(0.45, 40, 28, 0, Math.PI * 2, 0, 1.7), materials.hair);
  hairCap.scale.set(0.88, 1.08, 0.74);
  hairCap.position.z = 0.11;
  head.add(hairCap);

  // serious broadcast updo
  const bun = new THREE.Mesh(new THREE.SphereGeometry(0.23, 34, 26), materials.hairDark);
  bun.scale.set(1.18, 0.9, 0.95);
  bun.position.set(0, 0.38, -0.17);
  bun.castShadow = true;
  head.add(bun);

  const crownRoll = new THREE.Mesh(new THREE.TorusGeometry(0.235, 0.052, 12, 40, Math.PI * 1.72), materials.hair);
  crownRoll.rotation.set(Math.PI / 2, 0, 0.42);
  crownRoll.position.set(0, 0.25, -0.07);
  head.add(crownRoll);

  head.add(
    tube([[-0.31, 0.26, 0.16], [-0.24, 0.35, 0.04], [-0.12, 0.39, -0.05]], 0.05, materials.hair),
    tube([[0.31, 0.26, 0.16], [0.24, 0.35, 0.04], [0.12, 0.39, -0.05]], 0.05, materials.hair),
  );

  if (look === 'anime') {
    head.add(
      tube([[-0.30, 0.18, 0.18], [-0.40, -0.08, 0.20], [-0.34, -0.35, 0.12]], 0.055, materials.hair),
      tube([[0.30, 0.18, 0.18], [0.40, -0.08, 0.20], [0.34, -0.35, 0.12]], 0.055, materials.hair),
    );
  }

  const sideLockLeft = tube([[-0.33, 0.18, 0.23], [-0.43, -0.04, 0.21], [-0.36, -0.28, 0.14]], 0.038, materials.hair);
  const sideLockRight = tube([[0.33, 0.18, 0.23], [0.43, -0.04, 0.21], [0.36, -0.28, 0.14]], 0.038, materials.hair);
  const ahoge = tube([[0.02, 0.42, -0.02], [0.08, 0.58, -0.04], [0.18, 0.62, -0.02]], 0.025, materials.hair);
  head.add(sideLockLeft, sideLockRight, ahoge);

  const eyes = [];
  [-1, 1].forEach((side) => {
    const rig = new THREE.Group();
    rig.position.set(side * (anime ? 0.155 : 0.145), anime ? 0.06 : 0.055, anime ? 0.455 : 0.445);
    const white = new THREE.Mesh(new THREE.SphereGeometry(anime ? 0.10 : 0.082, 22, 16), materials.eye);
    white.scale.set(anime ? 1.12 : 1.15, anime ? 0.82 : 0.72, 0.4);
    const iris = new THREE.Mesh(new THREE.SphereGeometry(anime ? 0.052 : 0.036, 18, 14), materials.iris);
    iris.scale.z = 0.4;
    iris.position.z = 0.072;
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.020, 14, 10), materials.dark);
    pupil.position.z = 0.09;
    pupil.scale.z = 0.3;
    rig.add(white, iris, pupil);
    head.add(rig);
    eyes.push({ rig, white, iris, pupil });
  });

  const browLeft = tube([[-0.23, 0.18, 0.47], [-0.14, 0.21, 0.49], [-0.07, 0.19, 0.48]], 0.012, materials.hairDark);
  const browRight = tube([[0.07, 0.19, 0.48], [0.14, 0.21, 0.49], [0.23, 0.18, 0.47]], 0.012, materials.hairDark);
  head.add(browLeft, browRight);

  const nose = new THREE.Mesh(new THREE.ConeGeometry(anime ? 0.022 : 0.038, anime ? 0.07 : 0.11, 14), materials.skinShadow);
  nose.rotation.x = Math.PI / 2;
  nose.position.set(0, -0.03, 0.49);
  head.add(nose);

  const mouth = new THREE.Mesh(new THREE.SphereGeometry(look === 'anime' ? 0.075 : 0.09, 20, 14), materials.mouth);
  mouth.position.set(0, -0.19, 0.47);
  mouth.scale.set(1.08, 0.15, 0.24);
  head.add(mouth);

  const shoulders = {};
  [-1, 1].forEach((side) => {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 0.56, 0.67, 0);
    const upper = capsule(0.10, 0.40, materials.jacket);
    upper.position.y = -0.27;
    shoulder.add(upper);
    const elbow = new THREE.Group();
    elbow.position.y = -0.55;
    const forearm = capsule(0.085, 0.34, materials.jacket);
    forearm.position.y = -0.22;
    const hand = capsule(0.07, 0.11, materials.skin);
    hand.position.y = -0.47;
    hand.scale.set(0.8, 1, 0.55);
    elbow.add(forearm, hand);
    shoulder.add(elbow);
    root.add(shoulder);
    shoulders[side < 0 ? 'left' : 'right'] = { shoulder, elbow };
  });

  [-1, 1].forEach((side) => {
    const leg = capsule(0.135, 0.68, materials.dark);
    leg.position.set(side * 0.19, -0.70, 0);
    root.add(leg);
  });

  root.traverse((object) => {
    if (object.isMesh) object.frustumCulled = false;
  });

  return { root, head, eyes, mouth, browLeft, browRight, shoulders };
}

export class NewsWorld {
  constructor(canvas) {
    this.canvas = canvas;
    this.clock = new THREE.Clock();
    this.pointer = new THREE.Vector2();
    this.expression = 'serious';
    this.look = 'anime';
    this.cue = { name: 'idle', until: 0 };
    this.speechEnergy = 0;
    this.loaded = null;
    this.vrm = null;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#07080b');
    this.scene.fog = new THREE.FogExp2('#07080b', 0.09);

    this.camera = new THREE.PerspectiveCamera(30, 1, 0.01, 100);
    this.camera.position.set(0, 0.45, 3.75);
    this.camera.lookAt(0, 0.4, 0);

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;

    this.avatarStyle = 'anime';
    this.anchor = createAnchorAlice(this.avatarStyle);
    this.scene.add(this.anchor.root);

    this.#buildStudio();
    this.#wire();
    this.resize();
    this.renderer.setAnimationLoop(this.#render);
  }

  #buildStudio() {
    this.scene.add(new THREE.HemisphereLight('#f5f5f5', '#231210', 1.5));

    const key = new THREE.DirectionalLight('#fff0e8', 4.5);
    key.position.set(-3, 4, 4);
    key.castShadow = true;
    this.scene.add(key);

    const rim = new THREE.PointLight('#d43b47', 7, 8, 2);
    rim.position.set(3, 2, -2);
    this.scene.add(rim);

    const cool = new THREE.PointLight('#6d9fd6', 4, 7, 2);
    cool.position.set(-3, 1, -1);
    this.scene.add(cool);

    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(6, 80),
      new THREE.MeshStandardMaterial({ color: '#111217', roughness: 0.55, metalness: 0.4 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -1.18;
    floor.receiveShadow = true;
    this.scene.add(floor);

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(1.45, 0.025, 12, 96),
      new THREE.MeshBasicMaterial({ color: '#d12d3f' }),
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = -1.12;
    this.scene.add(ring);

    const wall = new THREE.Mesh(
      new THREE.CylinderGeometry(5.2, 5.2, 4.5, 64, 1, true),
      new THREE.MeshStandardMaterial({ color: '#0b0d11', roughness: 0.9, side: THREE.BackSide }),
    );
    wall.position.y = 0.7;
    this.scene.add(wall);
  }

  #wire() {
    this.canvas.addEventListener('pointermove', (event) => {
      const rect = this.canvas.getBoundingClientRect();
      this.pointer.x = ((event.clientX - rect.left) / Math.max(rect.width, 1) - 0.5) * 2;
      this.pointer.y = ((event.clientY - rect.top) / Math.max(rect.height, 1) - 0.5) * 2;
    });
    window.addEventListener('resize', this.resize);
  }

  async loadAsset(url) {
    const loader = getGLTFLoader();
    const gltf = await loader.loadAsync(url);
    const model = gltf.scene || gltf.scenes?.[0];
    if (!model) throw new Error('asset-has-no-scene');

    if (this.loaded) this.scene.remove(this.loaded);
    this.loaded = model;
    this.vrm = gltf.userData.vrm || null;
    this.anchor.root.visible = false;
    model.position.set(0, -1.12, 0);
    model.traverse((object) => {
      if (object.isMesh) object.frustumCulled = false;
    });
    this.scene.add(model);
    this.#frame(model);
    return { vrm: Boolean(this.vrm) };
  }

  #frame(model) {
    model.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(model);
    const size = bounds.getSize(new THREE.Vector3());
    const center = bounds.getCenter(new THREE.Vector3());
    model.position.x -= center.x;
    model.position.z -= center.z;
    model.position.y -= bounds.min.y + 1.12;
    this.camera.position.set(0, Math.max(0.4, size.y * 0.48), Math.max(2.8, size.y * 1.55));
    this.camera.lookAt(0, Math.max(0.35, size.y * 0.46), 0);
  }

  setAvatarStyle(style = 'anime') {
    if (!['anime', 'broadcast'].includes(style)) return;
    this.avatarStyle = style;
    if (this.loaded) {
      this.scene.remove(this.loaded);
      this.loaded = null;
      this.vrm = null;
    }
    if (this.anchor?.root) this.scene.remove(this.anchor.root);
    this.anchor = createAnchorAlice(style);
    this.scene.add(this.anchor.root);
    this.camera.position.set(0, 0.45, style === 'anime' ? 3.6 : 3.75);
    this.camera.lookAt(0, 0.4, 0);
  }

  setExpression(name) {
    this.expression = name || 'serious';
  }

  setLook(name = 'anime') {
    const next = name === 'news' ? 'news' : 'anime';
    if (next === this.look || this.loaded) {
      this.look = next;
      return;
    }
    this.scene.remove(this.anchor.root);
    this.look = next;
    this.anchor = createAnchorAlice(this.look);
    this.scene.add(this.anchor.root);
  }

  playCue(name, duration = 1800) {
    this.cue = { name: name || 'idle', until: performance.now() + duration };
  }

  setSpeechEnergy(value) {
    this.speechEnergy = THREE.MathUtils.clamp(Number(value) || 0, 0, 1);
  }

  setViseme(viseme = 'rest') {
    const anchor = this.anchor;
    if (anchor?.mouth) {
      const y = viseme === 'rest' ? 0.15 : viseme === 'A' ? 0.48 : viseme === 'I' ? 0.25 : viseme === 'U' ? 0.34 : viseme === 'E' ? 0.30 : 0.40;
      const x = viseme === 'I' || viseme === 'E' ? 1.35 : viseme === 'U' ? 0.72 : 1.08;
      anchor.mouth.scale.set(x, y, 0.24);
    }

    if (this.vrm?.expressionManager) {
      const map = { A: 'aa', I: 'ih', U: 'ou', E: 'ee', O: 'oh' };
      for (const name of ['aa', 'ih', 'ou', 'ee', 'oh']) {
        try { this.vrm.expressionManager.setValue(name, 0); } catch {}
      }
      if (map[viseme]) {
        try { this.vrm.expressionManager.setValue(map[viseme], 0.82); } catch {}
      }
    }
  }

  resize = () => {
    const width = this.canvas.clientWidth || innerWidth || 1;
    const height = this.canvas.clientHeight || innerHeight || 1;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / Math.max(height, 1);
    this.camera.updateProjectionMatrix();
  };

  #render = (time) => {
    const dt = Math.min(0.05, this.clock.getDelta());
    const t = time / 1000;
    const a = this.anchor;

    if (a?.root.visible) {
      a.root.position.y = Math.sin(t * 1.7) * 0.008;
      a.head.rotation.y = damp(a.head.rotation.y, this.pointer.x * 0.025 + Math.sin(t * 0.53) * 0.012, 5, dt);
      a.head.rotation.x = damp(a.head.rotation.x, -this.pointer.y * 0.012 + Math.sin(t * 0.37) * 0.006, 5, dt);

      a.eyes.forEach((eye) => {
        eye.rig.rotation.y = damp(eye.rig.rotation.y, this.pointer.x * 0.10, 8, dt);
        eye.rig.rotation.x = damp(eye.rig.rotation.x, -this.pointer.y * 0.05, 8, dt);
      });

      const activeCue = time < this.cue.until ? this.cue.name : 'idle';
      const L = a.shoulders.left;
      const R = a.shoulders.right;
      let rz = 0;
      let ry = 0;
      let elbow = 0;

      if (activeCue === 'present') {
        ry = -0.55;
        rz = -0.32;
        elbow = -0.55;
      } else if (activeCue === 'consider') {
        ry = -0.26;
        rz = -0.55;
        elbow = -1.0;
      } else if (activeCue === 'listen') {
        a.head.rotation.z = damp(a.head.rotation.z, -0.05, 8, dt);
      } else if (activeCue === 'nod') {
        a.head.rotation.x += Math.sin(t * 8) * 0.10;
      } else {
        a.head.rotation.z = damp(a.head.rotation.z, 0, 8, dt);
      }

      L.shoulder.rotation.z = damp(L.shoulder.rotation.z, 0, 7, dt);
      R.shoulder.rotation.z = damp(R.shoulder.rotation.z, rz, 7, dt);
      R.shoulder.rotation.y = damp(R.shoulder.rotation.y, ry, 7, dt);
      R.elbow.rotation.x = damp(R.elbow.rotation.x, elbow, 7, dt);

      const brow = this.expression === 'serious' ? 0.06
        : this.expression === 'warm' ? -0.02
          : this.expression === 'amused' ? -0.05
            : 0.02;
      a.browLeft.rotation.z = damp(a.browLeft.rotation.z, brow, 8, dt);
      a.browRight.rotation.z = damp(a.browRight.rotation.z, -brow, 8, dt);

      if (this.speechEnergy > 0.01) {
        a.mouth.scale.y = damp(a.mouth.scale.y, 0.18 + this.speechEnergy * 0.42, 12, dt);
      }
    }

    if (this.vrm) {
      try {
        const head = this.vrm.humanoid?.getNormalizedBoneNode?.('head')
          || this.vrm.humanoid?.getRawBoneNode?.('head');
        if (head) {
          head.rotation.y = Math.sin(t * 0.5) * 0.012;
          head.rotation.x = Math.sin(t * 0.35) * 0.008;
        }
        this.vrm.update?.(dt);
      } catch {}
    }

    this.renderer.render(this.scene, this.camera);
  };

  dispose() {
    window.removeEventListener('resize', this.resize);
    this.renderer.setAnimationLoop(null);
    this.renderer.dispose();
  }
}