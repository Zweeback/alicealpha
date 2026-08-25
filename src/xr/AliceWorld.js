import * as THREE from 'three';

const cyan = new THREE.Color('#39d9e6');
const amber = new THREE.Color('#d99a36');

function damp(current, target, lambda, delta) {
  return THREE.MathUtils.damp(current, target, lambda, delta);
}

function capsule(material, radius, length, radialSegments = 20) {
  return new THREE.Mesh(new THREE.CapsuleGeometry(radius, length, 8, radialSegments), material);
}

function tube(points, radius, material) {
  const curve = new THREE.CatmullRomCurve3(points.map((point) => new THREE.Vector3(...point)));
  return new THREE.Mesh(new THREE.TubeGeometry(curve, 30, radius, 8, false), material);
}

function createLab() {
  const group = new THREE.Group();
  const floorMaterial = new THREE.MeshStandardMaterial({ color: '#0b1114', roughness: 0.82, metalness: 0.24 });
  const floor = new THREE.Mesh(new THREE.CircleGeometry(5.5, 72), floorMaterial);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -1.16;
  floor.receiveShadow = true;
  group.add(floor);

  const wall = new THREE.Mesh(
    new THREE.CylinderGeometry(4.7, 4.7, 4.4, 48, 1, true),
    new THREE.MeshStandardMaterial({ color: '#080d10', roughness: 0.72, metalness: 0.36, side: THREE.BackSide }),
  );
  wall.position.y = 0.7;
  group.add(wall);

  const ringMaterial = new THREE.MeshBasicMaterial({ color: cyan, transparent: true, opacity: 0.17 });
  [-0.5, 1.15, 2.5].forEach((height, index) => {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(4.63, 0.018 + index * 0.006, 8, 96), ringMaterial);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = height;
    group.add(ring);
  });

  for (let index = 0; index < 8; index += 1) {
    const angle = (index / 8) * Math.PI * 2;
    const lightBar = new THREE.Mesh(
      new THREE.BoxGeometry(0.025, 1.4, 0.025),
      new THREE.MeshBasicMaterial({ color: index % 2 ? '#4b6970' : cyan, transparent: true, opacity: 0.28 }),
    );
    lightBar.position.set(Math.sin(angle) * 4.55, 0.65, Math.cos(angle) * 4.55);
    group.add(lightBar);
  }
  return group;
}

function makeArm(side, materials) {
  const shoulder = new THREE.Group();
  shoulder.position.set(side * 0.58, 0.66, 0);

  const upper = capsule(materials.garment, 0.105, 0.42, 16);
  upper.position.y = -0.28;
  upper.castShadow = true;
  shoulder.add(upper);

  const elbow = new THREE.Group();
  elbow.position.y = -0.57;
  const forearm = capsule(materials.garment, 0.09, 0.38, 16);
  forearm.position.y = -0.25;
  forearm.castShadow = true;
  elbow.add(forearm);

  const hand = capsule(materials.skin, 0.075, 0.12, 16);
  hand.position.y = -0.52;
  hand.scale.set(0.78, 1, 0.55);
  elbow.add(hand);
  shoulder.add(elbow);

  return { shoulder, elbow, hand };
}

function createAlice() {
  const root = new THREE.Group();
  const materials = {
    skin: new THREE.MeshStandardMaterial({ color: '#efbca9', roughness: 0.68, metalness: 0 }),
    skinShadow: new THREE.MeshStandardMaterial({ color: '#d99b87', roughness: 0.72 }),
    hair: new THREE.MeshStandardMaterial({ color: '#9b2c16', roughness: 0.58, metalness: 0.02 }),
    hairDark: new THREE.MeshStandardMaterial({ color: '#4e120c', roughness: 0.7 }),
    garment: new THREE.MeshStandardMaterial({ color: '#e8eceb', roughness: 0.44, metalness: 0.08 }),
    garmentShadow: new THREE.MeshStandardMaterial({ color: '#aebabe', roughness: 0.55, metalness: 0.12 }),
    eye: new THREE.MeshStandardMaterial({ color: '#eef7f5', roughness: 0.3 }),
    iris: new THREE.MeshStandardMaterial({ color: '#58aeb8', roughness: 0.26, metalness: 0.08 }),
    pupil: new THREE.MeshBasicMaterial({ color: '#081012' }),
    mouth: new THREE.MeshStandardMaterial({ color: '#7c2c2b', roughness: 0.62 }),
    cyan: new THREE.MeshStandardMaterial({ color: '#0b3b42', emissive: cyan, emissiveIntensity: 2.2, roughness: 0.28 }),
  };

  const hips = new THREE.Mesh(new THREE.SphereGeometry(0.43, 32, 20), materials.garmentShadow);
  hips.scale.set(1, 0.62, 0.7);
  hips.position.y = -0.08;
  hips.castShadow = true;
  root.add(hips);

  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.48, 0.94, 36), materials.garment);
  torso.position.y = 0.42;
  torso.scale.z = 0.7;
  torso.castShadow = true;
  root.add(torso);

  const seam = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.72, 0.018), materials.garmentShadow);
  seam.position.set(0, 0.45, 0.34);
  root.add(seam);

  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.2, 0.32, 28), materials.garment);
  neck.position.y = 0.99;
  neck.castShadow = true;
  root.add(neck);

  const chestCore = new THREE.Group();
  chestCore.position.set(0, 0.57, 0.38);
  const coreOuter = new THREE.Mesh(new THREE.TorusGeometry(0.115, 0.014, 12, 48), materials.cyan);
  const coreInner = new THREE.Mesh(new THREE.CircleGeometry(0.067, 32), materials.cyan);
  chestCore.add(coreOuter, coreInner);
  root.add(chestCore);

  const headPivot = new THREE.Group();
  headPivot.position.y = 1.34;
  root.add(headPivot);

  const hairBack = new THREE.Mesh(new THREE.SphereGeometry(0.49, 48, 36), materials.hairDark);
  hairBack.scale.set(0.92, 1.16, 0.78);
  hairBack.position.set(0, -0.01, 0.055);
  hairBack.castShadow = true;
  headPivot.add(hairBack);

  const face = new THREE.Mesh(new THREE.SphereGeometry(0.43, 56, 44), materials.skin);
  face.scale.set(0.82, 1.06, 0.7);
  face.position.z = 0.17;
  face.castShadow = true;
  headPivot.add(face);

  const hairCap = new THREE.Mesh(new THREE.SphereGeometry(0.45, 48, 28, 0, Math.PI * 2, 0, 1.72), materials.hair);
  hairCap.scale.set(0.87, 1.08, 0.74);
  hairCap.position.set(0, 0.02, 0.12);
  hairCap.castShadow = true;
  headPivot.add(hairCap);

  const curls = [
    [[-0.33, 0.26, 0.19], [-0.48, -0.03, 0.18], [-0.42, -0.39, 0.14], [-0.34, -0.67, 0.05]],
    [[-0.25, 0.3, 0.12], [-0.37, -0.03, 0.25], [-0.3, -0.43, 0.2], [-0.38, -0.72, 0.02]],
    [[0.34, 0.24, 0.17], [0.47, -0.08, 0.16], [0.39, -0.4, 0.13], [0.34, -0.64, 0.02]],
    [[0.27, 0.28, 0.1], [0.36, -0.02, 0.24], [0.28, -0.38, 0.2], [0.38, -0.66, 0.02]],
  ];
  curls.forEach((points, index) => {
    const curl = tube(points, index % 2 ? 0.055 : 0.07, materials.hair);
    curl.castShadow = true;
    headPivot.add(curl);
  });

  const eyeRigs = [];
  [-1, 1].forEach((side) => {
    const eyeRig = new THREE.Group();
    eyeRig.position.set(side * 0.145, 0.055, 0.445);
    const white = new THREE.Mesh(new THREE.SphereGeometry(0.085, 24, 16), materials.eye);
    white.scale.set(1.12, 0.72, 0.42);
    const iris = new THREE.Mesh(new THREE.SphereGeometry(0.038, 20, 14), materials.iris);
    iris.scale.z = 0.4;
    iris.position.z = 0.073;
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.017, 16, 12), materials.pupil);
    pupil.scale.z = 0.35;
    pupil.position.z = 0.09;
    eyeRig.add(white, iris, pupil);
    headPivot.add(eyeRig);
    eyeRigs.push({ group: eyeRig, white, iris, pupil });
  });

  const browLeft = tube([[-0.23, 0.17, 0.47], [-0.14, 0.2, 0.49], [-0.07, 0.18, 0.48]], 0.012, materials.hairDark);
  const browRight = tube([[0.07, 0.18, 0.48], [0.14, 0.2, 0.49], [0.23, 0.17, 0.47]], 0.012, materials.hairDark);
  headPivot.add(browLeft, browRight);

  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.12, 16), materials.skinShadow);
  nose.rotation.x = Math.PI / 2;
  nose.position.set(0, -0.03, 0.5);
  headPivot.add(nose);

  const mouth = new THREE.Mesh(new THREE.SphereGeometry(0.09, 24, 16), materials.mouth);
  mouth.position.set(0, -0.19, 0.472);
  mouth.scale.set(1.15, 0.16, 0.25);
  headPivot.add(mouth);

  const armLeft = makeArm(-1, materials);
  const armRight = makeArm(1, materials);
  root.add(armLeft.shoulder, armRight.shoulder);

  [-1, 1].forEach((side) => {
    const leg = capsule(materials.garment, 0.14, 0.7, 18);
    leg.position.set(side * 0.2, -0.69, 0);
    leg.castShadow = true;
    root.add(leg);
    const boot = capsule(materials.garmentShadow, 0.15, 0.23, 18);
    boot.position.set(side * 0.2, -1.13, 0.08);
    boot.rotation.x = Math.PI / 2;
    boot.scale.z = 1.15;
    boot.castShadow = true;
    root.add(boot);
  });

  root.traverse((object) => {
    if (object.isMesh) object.frustumCulled = false;
  });

  return {
    root,
    headPivot,
    eyeRigs,
    browLeft,
    browRight,
    mouth,
    chestCore,
    arms: { left: armLeft, right: armRight },
  };
}

export class AliceWorld {
  constructor(canvas, { overlayRoot, onInteract = () => {}, onSessionChange = () => {} } = {}) {
    this.canvas = canvas;
    this.overlayRoot = overlayRoot;
    this.onInteract = onInteract;
    this.onSessionChange = onSessionChange;
    this.clock = new THREE.Clock();
    this.pointer = new THREE.Vector2();
    this.presence = { present: true, x: 0, y: 0, distance: 0.5, expression: 'neutral' };
    this.performance = null;
    this.performanceStartedAt = 0;
    this.gesture = 'attentive';
    this.speechEnergy = 0;
    this.mode = 'desktop';
    this.arPlaced = false;
    this.hitTestSource = null;
    this.hitMatrix = null;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#070b0d');
    this.scene.fog = new THREE.FogExp2('#070b0d', 0.12);
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.01, 100);
    this.camera.position.set(0, 0.25, 3.35);
    this.camera.lookAt(0, 0.25, 0);

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.xr.enabled = true;

    this.lab = createLab();
    this.scene.add(this.lab);
    this.alice = createAlice();
    this.scene.add(this.alice.root);

    this.placementRing = new THREE.Mesh(
      new THREE.RingGeometry(0.36, 0.39, 64),
      new THREE.MeshBasicMaterial({ color: cyan, transparent: true, opacity: 0.65, side: THREE.DoubleSide }),
    );
    this.placementRing.rotation.x = -Math.PI / 2;
    this.placementRing.visible = false;
    this.scene.add(this.placementRing);

    this.#addLights();
    this.#wireInput();
    this.resize();
    this.renderer.setAnimationLoop(this.#render);
  }

  #addLights() {
    this.scene.add(new THREE.HemisphereLight('#d9f4f5', '#111318', 2.1));
    const key = new THREE.DirectionalLight('#fff3ea', 4.2);
    key.position.set(-2.4, 3.4, 3.5);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    this.scene.add(key);
    const rim = new THREE.PointLight(cyan, 18, 8, 2);
    rim.position.set(2.2, 1.4, -1.2);
    this.scene.add(rim);
    const warm = new THREE.PointLight(amber, 5, 6, 2);
    warm.position.set(-2.3, 0.5, 1.8);
    this.scene.add(warm);
  }

  #wireInput() {
    this.canvas.addEventListener('pointermove', (event) => {
      this.pointer.x = (event.clientX / innerWidth) * 2 - 1;
      this.pointer.y = -(event.clientY / innerHeight) * 2 + 1;
    });
    this.canvas.addEventListener('pointerup', () => this.onInteract());
    window.addEventListener('resize', this.resize);

    for (let index = 0; index < 2; index += 1) {
      const controller = this.renderer.xr.getController(index);
      controller.addEventListener('select', this.#handleXRSelect);
      this.scene.add(controller);
    }
  }

  #handleXRSelect = () => {
    if (this.mode === 'ar' && !this.arPlaced && this.hitMatrix) {
      const position = new THREE.Vector3().setFromMatrixPosition(this.hitMatrix);
      this.alice.root.position.set(position.x, position.y + 1.1, position.z);
      this.arPlaced = true;
      this.placementRing.visible = false;
      return;
    }
    this.onInteract();
  };

  async support() {
    if (!navigator.xr) return { ar: false, vr: false };
    const [ar, vr] = await Promise.all([
      navigator.xr.isSessionSupported('immersive-ar').catch(() => false),
      navigator.xr.isSessionSupported('immersive-vr').catch(() => false),
    ]);
    return { ar, vr };
  }

  async startXR(mode) {
    const sessionMode = mode === 'ar' ? 'immersive-ar' : 'immersive-vr';
    const options = {
      optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking', 'hit-test', 'dom-overlay'],
      domOverlay: this.overlayRoot ? { root: this.overlayRoot } : undefined,
    };
    const session = await navigator.xr.requestSession(sessionMode, options);
    this.mode = mode;
    this.lab.visible = mode !== 'ar';
    this.scene.background = mode === 'ar' ? null : new THREE.Color('#070b0d');
    this.scene.fog = mode === 'ar' ? null : new THREE.FogExp2('#070b0d', 0.12);
    this.alice.root.scale.setScalar(0.82);
    this.alice.root.position.set(0, 1.1, -1.7);
    this.lab.position.y = 1.15;
    this.arPlaced = mode !== 'ar';
    this.onSessionChange(mode);

    if (mode === 'ar') {
      const viewer = await session.requestReferenceSpace('viewer');
      this.hitTestSource = await session.requestHitTestSource?.({ space: viewer });
    }

    session.addEventListener('end', () => {
      this.mode = 'desktop';
      this.lab.visible = true;
      this.lab.position.y = 0;
      this.scene.background = new THREE.Color('#070b0d');
      this.scene.fog = new THREE.FogExp2('#070b0d', 0.12);
      this.alice.root.position.set(0, 0, 0);
      this.alice.root.scale.setScalar(1);
      this.placementRing.visible = false;
      this.hitTestSource = null;
      this.onSessionChange('desktop');
    });

    await this.renderer.xr.setSession(session);
    return session;
  }

  setPresence(presence) {
    this.presence = { ...this.presence, ...presence };
  }

  playPlan(plan) {
    this.performance = plan;
    this.performanceStartedAt = performance.now();
    this.gesture = plan.timeline.find((cue) => cue.type === 'gesture')?.name || 'attentive';
  }

  playCue(cue = {}) {
    const duration = THREE.MathUtils.clamp(Number(cue.duration_ms) || 4200, 800, 20000);
    this.playPlan({
      duration_ms: duration,
      dialogue_act: cue.dialogue_act || 'neutral',
      emotion: cue.emotion || 'neutral',
      gaze: cue.gaze || 'direct_soft',
      intensity: THREE.MathUtils.clamp(Number(cue.intensity) || 0.5, 0, 1),
      timeline: [{ t_ms: 0, type: 'gesture', name: cue.gesture || 'attentive' }],
    });
  }

  setSpeechEnergy(value) {
    this.speechEnergy = THREE.MathUtils.clamp(Number(value) || 0, 0, 1);
  }

  stopPlan() {
    this.performance = null;
    this.gesture = 'attentive';
  }

  resize = () => {
    const width = this.canvas.clientWidth || innerWidth;
    const height = this.canvas.clientHeight || innerHeight;
    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  };

  #render = (time, frame) => {
    const delta = Math.min(0.05, this.clock.getDelta());
    this.#updateHitTest(frame);
    this.#animate(time, delta);
    this.renderer.render(this.scene, this.camera);
  };

  #updateHitTest(frame) {
    if (!frame || this.mode !== 'ar' || this.arPlaced || !this.hitTestSource) return;
    const referenceSpace = this.renderer.xr.getReferenceSpace();
    const hit = frame.getHitTestResults(this.hitTestSource)?.[0];
    if (!hit) return;
    const pose = hit.getPose(referenceSpace);
    if (!pose) return;
    this.hitMatrix = new THREE.Matrix4().fromArray(pose.transform.matrix);
    this.placementRing.position.setFromMatrixPosition(this.hitMatrix);
    this.placementRing.visible = true;
  }

  #animate(time, delta) {
    const seconds = time / 1000;
    const { headPivot, eyeRigs, browLeft, browRight, mouth, chestCore, arms, root } = this.alice;
    const xrCamera = this.renderer.xr.isPresenting ? this.renderer.xr.getCamera() : this.camera;
    const userX = this.mode === 'desktop' ? this.presence.x * 0.22 + this.pointer.x * 0.08 : 0;
    const userY = this.mode === 'desktop' ? this.presence.y * 0.14 + this.pointer.y * 0.05 : 0;
    const targetYaw = THREE.MathUtils.clamp(userX, -0.28, 0.28);
    const targetPitch = THREE.MathUtils.clamp(-userY, -0.18, 0.18);

    headPivot.rotation.y = damp(headPivot.rotation.y, targetYaw + Math.sin(seconds * 0.37) * 0.018, 5.5, delta);
    headPivot.rotation.x = damp(headPivot.rotation.x, targetPitch + Math.sin(seconds * 0.29) * 0.012, 5.5, delta);
    headPivot.rotation.z = damp(headPivot.rotation.z, Math.sin(seconds * 0.23) * 0.012, 3.2, delta);

    const blinkPhase = seconds % 4.7;
    const naturalBlink = blinkPhase > 4.55 ? Math.max(0.08, 1 - (blinkPhase - 4.55) * 10) : 1;
    const blink = Math.min(naturalBlink, 1 - (this.presence.blink || 0) * 0.55);
    eyeRigs.forEach(({ group, white }) => {
      group.rotation.y = damp(group.rotation.y, targetYaw * 0.75, 10, delta);
      group.rotation.x = damp(group.rotation.x, targetPitch * 0.7, 10, delta);
      white.scale.y = damp(white.scale.y, 0.72 * blink, 22, delta);
    });

    const elapsed = this.performance ? time - this.performanceStartedAt : 0;
    const timedPerformance = Boolean(this.performance && elapsed < this.performance.duration_ms);
    const speaking = timedPerformance || this.speechEnergy > 0.035;
    const syntheticEnergy = timedPerformance ? 0.2 + Math.abs(Math.sin(elapsed * 0.022)) * 0.52 : 0;
    const speechEnergy = Math.max(this.speechEnergy, syntheticEnergy);
    mouth.scale.y = damp(mouth.scale.y, speaking ? 0.14 + speechEnergy * 0.55 : this.presence.expression === 'smile' ? 0.1 : 0.06, 18, delta);
    mouth.scale.x = damp(mouth.scale.x, this.presence.expression === 'smile' ? 1.35 : 1.15, 8, delta);
    chestCore.scale.setScalar(1 + (speaking ? speechEnergy * 0.15 : Math.sin(seconds * 1.4) * 0.025));

    const curious = this.presence.expression === 'curious' || this.performance?.dialogue_act === 'question' || this.performance?.emotion === 'curious';
    browLeft.rotation.z = damp(browLeft.rotation.z, curious ? -0.12 : 0, 7, delta);
    browRight.rotation.z = damp(browRight.rotation.z, curious ? 0.12 : 0, 7, delta);
    browLeft.position.y = damp(browLeft.position.y, curious ? 0.025 : 0, 7, delta);
    browRight.position.y = damp(browRight.position.y, curious ? 0.025 : 0, 7, delta);

    this.#animateGesture(arms, delta, speaking);
    root.rotation.z = Math.sin(seconds * 0.55) * 0.008;

    if (this.renderer.xr.isPresenting && (this.mode !== 'ar' || this.arPlaced)) {
      const cameraPosition = new THREE.Vector3();
      xrCamera.getWorldPosition(cameraPosition);
      const direction = cameraPosition.clone().sub(root.position);
      const targetRotation = Math.atan2(direction.x, direction.z);
      root.rotation.y = damp(root.rotation.y, targetRotation, 2.5, delta);
    }

    if (timedPerformance && elapsed >= this.performance.duration_ms - 40) this.stopPlan();
  }

  #animateGesture(arms, delta, speaking) {
    const targets = {
      attentive: { lz: -0.04, rz: 0.04, lx: 0, rx: 0, le: 0.05, re: -0.05 },
      welcome: { lz: -0.48, rz: 0.48, lx: -0.15, rx: -0.15, le: -0.28, re: 0.28 },
      hand_to_core: { lz: -0.08, rz: 0.72, lx: 0, rx: -0.38, le: 0.02, re: 1.15 },
      consider: { lz: -0.04, rz: 0.42, lx: 0, rx: -0.44, le: 0.04, re: 1.52 },
      open_hands: { lz: -0.62, rz: 0.62, lx: -0.18, rx: -0.18, le: -0.38, re: 0.38 },
      settle: { lz: -0.03, rz: 0.03, lx: 0, rx: 0, le: 0.02, re: -0.02 },
    }[this.gesture] || { lz: -0.04, rz: 0.04, lx: 0, rx: 0, le: 0.05, re: -0.05 };

    const pulse = speaking ? Math.sin(performance.now() * 0.004) * 0.035 : 0;
    arms.left.shoulder.rotation.z = damp(arms.left.shoulder.rotation.z, targets.lz + pulse, 5.5, delta);
    arms.right.shoulder.rotation.z = damp(arms.right.shoulder.rotation.z, targets.rz - pulse, 5.5, delta);
    arms.left.shoulder.rotation.x = damp(arms.left.shoulder.rotation.x, targets.lx, 5.5, delta);
    arms.right.shoulder.rotation.x = damp(arms.right.shoulder.rotation.x, targets.rx, 5.5, delta);
    arms.left.elbow.rotation.z = damp(arms.left.elbow.rotation.z, targets.le, 6, delta);
    arms.right.elbow.rotation.z = damp(arms.right.elbow.rotation.z, targets.re, 6, delta);
  }

  dispose() {
    window.removeEventListener('resize', this.resize);
    this.renderer.setAnimationLoop(null);
    this.renderer.dispose();
    this.scene.traverse((object) => {
      object.geometry?.dispose?.();
      if (Array.isArray(object.material)) object.material.forEach((material) => material.dispose?.());
      else object.material?.dispose?.();
    });
  }
}
