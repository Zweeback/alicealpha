import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { getGLTFLoader } from '../xr/loader.js';
import { calculatePerspectiveFrame } from '../xr/framing.js';

// Two clones of one rigged avatar. They are twins on purpose: same face, different light,
// clothes and behaviour. No claim is made that this is a final approved Alice model.

const LOOKS = Object.freeze({
  sami: {
    side: -1,
    yaw: 0.30,
    outfit: '#2a2e3a',
    skin: '#dfe6f0',
    glow: '#7ea6ff',
    ring: '#5f88e0',
    baseSmile: 0,
    brows: { browDownLeft: 0.24, browDownRight: 0.24 },
  },
  elisa: {
    side: 1,
    yaw: -0.30,
    outfit: '#ff8c99',
    skin: '#fff1ec',
    glow: '#ff5b72',
    ring: '#d12d4a',
    baseSmile: 0.16,
    brows: { browInnerUpLeft: 0.18, browInnerUpRight: 0.18 },
  },
});

const VISEMES = Object.freeze({
  A: { morph: 'aa', weight: 0.85, jaw: 0.5 },
  I: { morph: 'ih', weight: 0.7, jaw: 0.2 },
  U: { morph: 'ou', weight: 0.8, jaw: 0.22 },
  E: { morph: 'E', weight: 0.8, jaw: 0.3 },
  O: { morph: 'oh', weight: 0.85, jaw: 0.38 },
  rest: { morph: null, weight: 0, jaw: 0.1 },
});
const VISEME_MORPHS = ['aa', 'ih', 'ou', 'E', 'oh'];

const damp = (current, target, lambda, dt) => THREE.MathUtils.damp(current, target, lambda, dt);

function collectMorphs(root) {
  const map = new Map();
  root.traverse((object) => {
    if (!object.isMesh || !object.morphTargetDictionary || !object.morphTargetInfluences) return;
    for (const [name, index] of Object.entries(object.morphTargetDictionary)) {
      if (!map.has(name)) map.set(name, []);
      map.get(name).push({ mesh: object, index });
    }
  });
  return map;
}

function setMorph(map, name, value) {
  const targets = map.get(name);
  if (!targets) return;
  for (const target of targets) target.mesh.morphTargetInfluences[target.index] = value;
}

// Rotates `bone` so that the segment bone -> child points along `direction` (world space).
// Independent of the rig's local axis conventions.
function aimBone(bone, child, direction) {
  if (!bone || !child || !bone.parent) return false;
  bone.updateWorldMatrix(true, false);
  child.updateWorldMatrix(true, false);
  const from = bone.getWorldPosition(new THREE.Vector3());
  const to = child.getWorldPosition(new THREE.Vector3());
  const current = to.sub(from).normalize();
  const delta = new THREE.Quaternion().setFromUnitVectors(current, direction.clone().normalize());
  const boneWorld = bone.getWorldQuaternion(new THREE.Quaternion());
  const parentWorld = bone.parent.getWorldQuaternion(new THREE.Quaternion());
  bone.quaternion.copy(parentWorld.invert().multiply(delta.multiply(boneWorld)));
  bone.updateMatrixWorld(true);
  return true;
}

function lowerArms(root) {
  const pose = { arms: false };
  for (const prefix of ['Left', 'Right']) {
    const arm = root.getObjectByName(`${prefix}Arm`);
    const fore = root.getObjectByName(`${prefix}ForeArm`);
    const hand = root.getObjectByName(`${prefix}Hand`);
    if (!arm || !fore || !hand) continue;
    root.updateMatrixWorld(true);
    const side = Math.sign(fore.getWorldPosition(new THREE.Vector3()).x - arm.getWorldPosition(new THREE.Vector3()).x) || 1;
    aimBone(arm, fore, new THREE.Vector3(side * 0.14, -1, -0.02));
    root.updateMatrixWorld(true);
    aimBone(fore, hand, new THREE.Vector3(side * 0.06, -1, 0.26));
    pose.arms = true;
  }
  root.updateMatrixWorld(true);
  return pose;
}

function tintMaterials(root, look) {
  root.traverse((object) => {
    if (!object.isMesh) return;
    object.frustumCulled = false;
    const clone = (material) => {
      const next = material.clone();
      const name = String(material.name || '');
      if (name === 'outfit') next.color.set(look.outfit);
      else if (name === 'AvatarBody' || name === 'AvatarHead') next.color.set(look.skin);
      return next;
    };
    object.material = Array.isArray(object.material) ? object.material.map(clone) : clone(object.material);
  });
}

function radialTexture(inner, outer, size = 512) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, inner);
  gradient.addColorStop(1, outer);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export class TwinWorld {
  constructor(canvas) {
    this.canvas = canvas;
    this.clock = new THREE.Clock();
    this.twins = {};
    this.speakerId = null;
    this.frame = null;
    this.disposed = false;
    this.info = { model: null, bones: {}, morphs: 0 };

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#090a0f');

    this.camera = new THREE.PerspectiveCamera(28, 1, 0.05, 80);
    this.camera.position.set(0, 1.2, 4.5);

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 2));

    this.#buildStudio();

    this.resize = this.resize.bind(this);
    if (typeof ResizeObserver !== 'undefined' && canvas.parentElement) {
      this.observer = new ResizeObserver(this.resize);
      this.observer.observe(canvas.parentElement);
    }
    globalThis.addEventListener?.('resize', this.resize);
    this.resize();
    this.renderer.setAnimationLoop((time) => this.#render(time));
  }

  #buildStudio() {
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.55;
    pmrem.dispose();

    this.scene.add(new THREE.HemisphereLight('#ffffff', '#2a2630', 1.2));

    const key = new THREE.DirectionalLight('#fff3ea', 2.6);
    key.position.set(-2.5, 4, 5);
    this.scene.add(key);

    const fill = new THREE.DirectionalLight('#c9d6ff', 1.1);
    fill.position.set(3, 2, 4);
    this.scene.add(fill);

    const backdrop = new THREE.Mesh(
      new THREE.PlaneGeometry(18, 10),
      new THREE.MeshBasicMaterial({ map: radialTexture('#242838', '#07080c'), toneMapped: false }),
    );
    backdrop.position.set(0, 2.2, -3.2);
    this.scene.add(backdrop);

    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(7, 96),
      new THREE.MeshStandardMaterial({ color: '#12141b', roughness: 0.6, metalness: 0.25 }),
    );
    floor.rotation.x = -Math.PI / 2;
    this.scene.add(floor);
  }

  async load(url) {
    const gltf = await getGLTFLoader().loadAsync(url);
    if (this.disposed) return null;
    const source = gltf.scene || gltf.scenes?.[0];
    if (!source) throw new Error('asset-has-no-scene');

    const bounds = {};
    let morphCount = 0;
    for (const [id, look] of Object.entries(LOOKS)) {
      const model = cloneSkinned(source);
      tintMaterials(model, look);

      const group = new THREE.Group();
      group.add(model);
      this.scene.add(group);
      group.updateMatrixWorld(true);

      const pose = lowerArms(model);
      const box = new THREE.Box3().setFromObject(group);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      model.position.x -= center.x;
      model.position.z -= center.z;
      model.position.y -= box.min.y;
      group.updateMatrixWorld(true);
      bounds[id] = size;

      const morphs = collectMorphs(model);
      morphCount = Math.max(morphCount, morphs.size);
      const bone = (name) => {
        const node = model.getObjectByName(name);
        return node ? { node, rest: node.quaternion.clone() } : null;
      };

      const glow = new THREE.PointLight(look.glow, 2.4, 6, 2);
      this.scene.add(glow);

      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.5, 0.56, 72),
        new THREE.MeshBasicMaterial({ color: look.ring, transparent: true, opacity: 0.55, toneMapped: false }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.004;
      this.scene.add(ring);

      const shadow = new THREE.Mesh(
        new THREE.CircleGeometry(0.62, 48),
        new THREE.MeshBasicMaterial({ map: radialTexture('rgba(0,0,0,0.75)', 'rgba(0,0,0,0)', 256), transparent: true, depthWrite: false, toneMapped: false }),
      );
      shadow.rotation.x = -Math.PI / 2;
      shadow.position.y = 0.002;
      this.scene.add(shadow);

      this.twins[id] = {
        id,
        look,
        group,
        model,
        glow,
        ring,
        shadow,
        morphs,
        weights: {},
        bones: {
          head: bone('Head'),
          neck: bone('Neck1'),
          chest: bone('Spine2'),
        },
        state: { speaking: false, viseme: 'rest', whisper: false, giggleUntil: 0 },
        lean: 0,
        phase: id === 'sami' ? 0 : 1.7,
        blink: { next: performance.now() + 1500 + (id === 'sami' ? 0 : 900), start: -1 },
        pose,
      };
    }

    const single = bounds.sami;
    this.single = { width: single.x, height: single.y, depth: single.z };
    const spacing = Math.max(0.36, this.single.width * 0.56);
    for (const twin of Object.values(this.twins)) {
      twin.baseX = twin.look.side * spacing;
      twin.group.position.x = twin.baseX;
      twin.group.rotation.y = twin.look.yaw;
      twin.glow.position.set(twin.baseX, this.single.height * 0.92, 1.1);
      twin.ring.position.x = twin.baseX;
      twin.shadow.position.x = twin.baseX;
    }
    this.spacing = spacing;

    this.info = {
      model: url,
      morphs: morphCount,
      armsLowered: Object.values(this.twins).every((twin) => twin.pose.arms),
      heightM: Number(this.single.height.toFixed(2)),
    };
    this.#applyFrame();
    return this.info;
  }

  setSpeaker(id) {
    this.speakerId = this.twins[id] ? id : null;
  }

  setTwinState(id, patch = {}) {
    const twin = this.twins[id];
    if (!twin) return;
    Object.assign(twin.state, patch);
  }

  // Portrait screens get a waist-up crop so two figures stay readable; wide screens show full bodies.
  #applyFrame() {
    if (!this.single) return;
    const width = this.canvas.clientWidth || 1;
    const height = this.canvas.clientHeight || 1;
    const aspect = width / height;
    const fraction = aspect < 0.75 ? 0.46 : aspect < 1.2 ? 0.74 : 1;
    const pairWidth = this.spacing * 2 + this.single.width * 0.8;
    const { distance } = calculatePerspectiveFrame({
      viewportWidth: width,
      viewportHeight: height,
      verticalFovDegrees: this.camera.fov,
      boundsWidth: pairWidth,
      boundsHeight: this.single.height * fraction,
      boundsDepth: 0,
      padding: 1.1,
      minimumDistance: 1.5,
    });
    const top = this.single.height * 1.04;
    const centerY = top - (this.single.height * fraction) / 2;
    this.camera.position.set(0, centerY, distance);
    this.camera.lookAt(0, centerY, 0);
    this.frame = { aspect: Number(aspect.toFixed(2)), fraction, distance: Number(distance.toFixed(2)) };
  }

  resize() {
    if (this.disposed) return;
    const width = this.canvas.clientWidth || 1;
    const height = this.canvas.clientHeight || 1;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / Math.max(height, 1);
    this.camera.updateProjectionMatrix();
    this.#applyFrame();
  }

  #approach(twin, name, target, lambda, dt) {
    const next = damp(twin.weights[name] ?? 0, target, lambda, dt);
    twin.weights[name] = next;
    setMorph(twin.morphs, name, next);
  }

  #pose(bone, pitch, yaw, roll) {
    if (!bone) return;
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, yaw, roll, 'YXZ'));
    bone.node.quaternion.copy(bone.rest).multiply(q);
  }

  #updateTwin(twin, t, dt, now) {
    const { state, look } = twin;
    const isSpeaker = this.speakerId === twin.id;
    const whisper = state.speaking && state.whisper;
    const scale = whisper ? 0.5 : 1;
    const viseme = VISEMES[state.viseme] || VISEMES.rest;

    for (const name of VISEME_MORPHS) {
      const target = state.speaking && viseme.morph === name ? viseme.weight * scale : 0;
      this.#approach(twin, name, target, 24, dt);
    }
    this.#approach(twin, 'jawOpen', state.speaking ? viseme.jaw * scale : 0, 20, dt);

    const giggle = THREE.MathUtils.clamp((state.giggleUntil - now) / 1200, 0, 1);
    const smile = Math.max(look.baseSmile, giggle * 0.75);
    this.#approach(twin, 'mouthSmileLeft', smile, 10, dt);
    this.#approach(twin, 'mouthSmileRight', smile, 10, dt);
    for (const [name, value] of Object.entries(look.brows)) {
      this.#approach(twin, name, value + (look.baseSmile > 0 ? giggle * 0.2 : 0), 8, dt);
    }

    if (now >= twin.blink.next) {
      twin.blink.start = now;
      twin.blink.next = now + 2200 + Math.random() * 3200;
    }
    const blinking = twin.blink.start >= 0 && now - twin.blink.start < 170;
    const blink = blinking ? Math.sin((Math.PI * (now - twin.blink.start)) / 170) : 0;
    this.#approach(twin, 'eyeBlinkLeft', blink, 60, dt);
    this.#approach(twin, 'eyeBlinkRight', blink, 60, dt);

    const gaze = this.speakerId == null ? 0.2 : isSpeaker ? 0.14 : 0.44;
    const yaw = -look.side * gaze + Math.sin(t * 0.45 + twin.phase) * 0.02;
    const bob = Math.sin(t * 26) * 0.035 * giggle;
    const talk = state.speaking ? Math.sin(t * 5.5 + twin.phase) * 0.018 : 0;
    this.#pose(twin.bones.head, 0.02 + bob + talk, yaw * 0.7, 0);
    this.#pose(twin.bones.neck, bob * 0.4, yaw * 0.3, 0);
    this.#pose(twin.bones.chest, Math.sin(t * 1.5 + twin.phase) * 0.008 + Math.sin(t * 26) * 0.02 * giggle, 0, 0);

    twin.lean = damp(twin.lean, whisper ? 1 : 0, 6, dt);
    twin.group.position.x = twin.baseX - look.side * twin.lean * 0.08;
    twin.group.rotation.y = look.yaw * (1 + 0.45 * twin.lean);

    const intensity = isSpeaker ? 6 : this.speakerId ? 1.1 : 2.4;
    twin.glow.intensity = damp(twin.glow.intensity, intensity, 6, dt);
    twin.ring.material.opacity = damp(twin.ring.material.opacity, isSpeaker ? 1 : 0.35, 6, dt);
  }

  #render(time) {
    if (this.disposed) return;
    const dt = Math.min(0.05, this.clock.getDelta());
    const t = time / 1000;
    const now = performance.now();
    for (const twin of Object.values(this.twins)) this.#updateTwin(twin, t, dt, now);
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.disposed = true;
    this.observer?.disconnect();
    globalThis.removeEventListener?.('resize', this.resize);
    this.renderer.setAnimationLoop(null);
    this.renderer.dispose();
  }
}
