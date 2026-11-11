import * as THREE from 'three';
import { calculatePerspectiveFrame } from './framing.js';
import { getGLTFLoader } from './loader.js';
import { resolveAvatarSelection } from './avatarCatalog.js';
import { sampleMicroMotion } from './microMotion.js';
import { resolveMorphWeight } from './rigExpressions.js';
import { validateCandidateFile, validateGlbHeader, inspectCandidateScene } from './candidateImport.js';
import { cleanVisemes } from '../core/lipSync.js';
import { AliceRuntime } from './aliceRuntime.js';

const cyan = new THREE.Color('#8eced0');
const amber = new THREE.Color('#c18767');

function damp(current, target, lambda, delta) {
  return THREE.MathUtils.damp(current, target, lambda, delta);
}

// VRM 1.0 avatars that ship the ARKit-52 expression set (checked via `jawOpen`) are driven by
// AliceRuntime: blink, gaze, saccades, breathing, emotion and visemes. Any other VRM/GLB keeps
// the legacy expression path. The runtime only moves expressions and a few spine/head bones.
function createArkitRuntime(vrm) {
  if (!vrm?.expressionManager?.getExpression('jawOpen')) return null;
  vrm.update(0);
  return new AliceRuntime(vrm);
}

// Model emotion vocabulary (server/alicePrompt.js) -> AliceRuntime emotion + weight.
const RUNTIME_EMOTIONS = Object.freeze({
  warm: ['happy', 0.55],
  playful: ['happy', 0.8],
  calm: ['relaxed', 0.7],
  concerned: ['sad', 0.45],
  curious: ['surprised', 0.18],
  focused: ['relaxed', 0.25],
});

// Upper-arm abduction (rad) per gesture for the VRM T-pose rest. Larger = arms further down.
const RUNTIME_ARM_ANGLE = Object.freeze({
  attentive: 1.2, settle: 1.2, hand_to_core: 1.2, consider: 1.2, welcome: 0.95, open_hands: 0.85,
});

function capsule(material, radius, length, radialSegments = 20) {
  return new THREE.Mesh(new THREE.CapsuleGeometry(radius, length, 8, radialSegments), material);
}

function tube(points, radius, material) {
  const curve = new THREE.CatmullRomCurve3(points.map((point) => new THREE.Vector3(...point)));
  return new THREE.Mesh(new THREE.TubeGeometry(curve, 30, radius, 8, false), material);
}

function createLab() {
  const group = new THREE.Group();

  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(6.4, 96),
    new THREE.MeshStandardMaterial({
      color: '#090b0c',
      roughness: 0.94,
      metalness: 0.03,
    }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -1.17;
  floor.receiveShadow = true;
  group.add(floor);

  const wall = new THREE.Mesh(
    new THREE.CylinderGeometry(5.5, 5.5, 5.2, 72, 1, true),
    new THREE.MeshStandardMaterial({
      color: '#07090a',
      roughness: 0.96,
      metalness: 0.02,
      side: THREE.BackSide,
    }),
  );
  wall.position.y = 0.95;
  group.add(wall);

  const plinth = new THREE.Mesh(
    new THREE.CylinderGeometry(1.28, 1.38, 0.07, 72),
    new THREE.MeshStandardMaterial({
      color: '#111415',
      roughness: 0.82,
      metalness: 0.08,
    }),
  );
  plinth.position.y = -1.135;
  plinth.receiveShadow = true;
  group.add(plinth);

  const halo = new THREE.Mesh(
    new THREE.RingGeometry(1.62, 1.635, 128),
    new THREE.MeshBasicMaterial({
      color: '#dfe7e4',
      transparent: true,
      opacity: 0.055,
      side: THREE.DoubleSide,
    }),
  );
  halo.position.set(0, 0.62, -1.82);
  group.add(halo);

  const horizon = new THREE.Mesh(
    new THREE.TorusGeometry(4.9, 0.008, 8, 144),
    new THREE.MeshBasicMaterial({
      color: '#d8dedb',
      transparent: true,
      opacity: 0.045,
    }),
  );
  horizon.rotation.x = Math.PI / 2;
  horizon.position.y = -0.72;
  group.add(horizon);

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

function createProceduralAlice() {
  const root = new THREE.Group();
  const materials = {
    skin: new THREE.MeshStandardMaterial({ color: '#e7b5a3', roughness: 0.54, metalness: 0 }),
    skinShadow: new THREE.MeshStandardMaterial({ color: '#c98f7d', roughness: 0.62, metalness: 0 }),
    hair: new THREE.MeshStandardMaterial({ color: '#8a281a', roughness: 0.72, metalness: 0 }),
    hairDark: new THREE.MeshStandardMaterial({ color: '#43130e', roughness: 0.78, metalness: 0 }),
    garment: new THREE.MeshStandardMaterial({ color: '#ddd9d1', roughness: 0.86, metalness: 0 }),
    garmentShadow: new THREE.MeshStandardMaterial({ color: '#aaa59e', roughness: 0.9, metalness: 0 }),
    eye: new THREE.MeshStandardMaterial({ color: '#e9efeb', roughness: 0.38 }),
    iris: new THREE.MeshStandardMaterial({ color: '#6896a0', roughness: 0.4, metalness: 0 }),
    pupil: new THREE.MeshBasicMaterial({ color: '#0a0c0d' }),
    mouth: new THREE.MeshStandardMaterial({ color: '#854c4b', roughness: 0.7 }),
    cyan: new THREE.MeshStandardMaterial({ color: '#7f8b89', roughness: 0.72, metalness: 0.08 }),
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
  chestCore.visible = false;
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
    materials,
  };
}

function createProceduralGlados() {
  const root = new THREE.Group();
  const shell = new THREE.MeshStandardMaterial({ color: '#d9dde0', metalness: 0.72, roughness: 0.24 });
  const dark = new THREE.MeshStandardMaterial({ color: '#15191c', metalness: 0.82, roughness: 0.22 });
  const eyeMaterial = new THREE.MeshStandardMaterial({
    color: '#ffba52',
    metalness: 0.3,
    roughness: 0.18,
    emissive: '#ff5a00',
    emissiveIntensity: 3.5,
  });

  const headPivot = new THREE.Group();
  root.add(headPivot);

  const core = new THREE.Mesh(new THREE.SphereGeometry(0.72, 48, 32), shell);
  core.scale.set(0.86, 1.06, 0.72);
  core.castShadow = true;
  headPivot.add(core);

  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.31, 0.075, 18, 48), dark);
  ring.position.z = 0.63;
  headPivot.add(ring);

  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.17, 32, 20), eyeMaterial);
  eye.position.z = 0.72;
  headPivot.add(eye);

  for (let index = 0; index < 4; index += 1) {
    const panel = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.18, 0.82), shell);
    const angle = (index / 4) * Math.PI * 2;
    panel.position.set(Math.cos(angle) * 0.76, Math.sin(angle) * 0.54, 0);
    panel.rotation.z = angle + 0.5;
    panel.castShadow = true;
    headPivot.add(panel);
  }

  const spine = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.14, 2.35, 18), dark);
  spine.position.y = 1.72;
  root.add(spine);

  const upperJoint = new THREE.Mesh(new THREE.SphereGeometry(0.22, 24, 16), dark);
  upperJoint.position.y = 2.88;
  root.add(upperJoint);

  root.position.y = 0.08;
  root.traverse((object) => {
    if (object.isMesh) object.frustumCulled = false;
  });

  return { root, headPivot, eye, eyeMaterial };
}


async function createAlice() {
  const root = new THREE.Group();
  const state = {
    root,
    isProcedural: true,
    headPivot: new THREE.Group(),
    eyeRigs: [],
    browLeft: new THREE.Group(),
    browRight: new THREE.Group(),
    mouth: new THREE.Group(),
    chestCore: new THREE.Group(),
    arms: {
      left: { shoulder: new THREE.Group(), elbow: new THREE.Group() },
      right: { shoulder: new THREE.Group(), elbow: new THREE.Group() }
    },
    vrm: null,
    runtime: null,
    gltf: null,
    morphMeshes: [],
    mixer: null,
  };

  const params = new URLSearchParams(window.location.search);
  const procedural = params.get('procedural');
  const selection = resolveAvatarSelection(window.location.search);
  const useProcedural = procedural === '1' || selection.kind === 'procedural';

  if (!useProcedural && (selection.kind === 'glb' || selection.kind === 'vrm')) {
    try {
      const loader = getGLTFLoader();
      const gltf = await loader.loadAsync(selection.url);
      state.gltf = gltf;
      const model = gltf.scene || gltf.scenes[0];
      root.add(model);
      model.rotation.set(0, 0, 0);
      state.isProcedural = false;
      if (gltf.userData.vrm) {
        state.vrm = gltf.userData.vrm;
        const vrm = state.vrm;
        model.traverse((obj) => { if (obj.isMesh) obj.frustumCulled = false; });
        state.runtime = createArkitRuntime(vrm);
        if (vrm.humanoid) {
          const getBone = (name) => vrm.humanoid.getRawBoneNode(name) || new THREE.Group();
          state.headPivot = getBone('head');
          state.arms.left.shoulder = getBone('leftShoulder');
          state.arms.left.elbow = getBone('leftLowerArm');
          state.arms.right.shoulder = getBone('rightShoulder');
          state.arms.right.elbow = getBone('rightLowerArm');
          state.chestCore = getBone('spine');
        }
      } else {
        // Bind to actual skeleton bone nodes, never to similarly named head meshes.
        const bones = [];
        model.traverse((obj) => {
          if (obj.isBone) bones.push(obj);
          if (obj.isMesh) {
            obj.frustumCulled = false;
            if (obj.morphTargetDictionary && obj.morphTargetInfluences) {
              state.morphMeshes.push(obj);
            }
          }
        });
        const bone = (...names) => bones.find((obj) =>
          names.some((name) => obj.name.toLowerCase() === name.toLowerCase())
        ) || new THREE.Group();
        state.headPivot = bone('Head');
        state.arms.left.shoulder = bone('LeftShoulder', 'LeftUpperArm', 'LeftArm');
        state.arms.left.elbow = bone('LeftForeArm', 'LeftLowerArm');
        state.arms.right.shoulder = bone('RightShoulder', 'RightUpperArm', 'RightArm');
        state.arms.right.elbow = bone('RightForeArm', 'RightLowerArm');
        state.chestCore = bone('Spine2', 'Spine1', 'Spine');
      }
      if (gltf.animations?.length) {
        state.mixer = new THREE.AnimationMixer(model);
        state.mixer.clipAction(gltf.animations[0]).play();
      }
      return state;
    } catch (err) {
      console.warn(`Failed to load avatar candidate ${selection.id}; falling back to procedural Alice:`, err);
    }
  }
  // Procedural fallback
  const proceduralState = createProceduralAlice();
  return { ...proceduralState, isProcedural: true, vrm: null, gltf: null };
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
    this.liveVisemes = null; // echte Vokalgewichte aus dem Audiosignal (LipSync)
    this.liveVisemeAt = 0;
    this.liveVolume = 0;
    this.frame = null;
    this.parallax = { x: 0, y: 0 };
    this.aura = 0;
    this.mode = 'desktop';
    this.arPlaced = false;
    this.hitTestSource = null;
    this.hitMatrix = null;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#050607');
    this.scene.fog = new THREE.FogExp2('#050607', 0.085);
    this.camera = new THREE.PerspectiveCamera(35, 1, 0.01, 100);
    this.camera.position.set(0, 0.35, 3.45);
    this.camera.lookAt(0, 0.35, 0);

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.9;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.xr.enabled = true;

    this.lab = createLab();
    this.scene.add(this.lab);
    this.alice = null;
    this.representation = 'french';
    this.glados = createProceduralGlados();
    this.glados.root.visible = false;
    this.scene.add(this.glados.root);

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
  async init() {
    try {
      this.alice = await createAlice();
    } catch (error) {
      console.warn('Alice avatar init failed; using procedural Alice:', error);
      this.alice = { ...createProceduralAlice(), isProcedural: true, vrm: null, gltf: null };
    }
    this.scene.add(this.alice.root);
    this.alice.root.updateMatrixWorld(true);
    this.desktopBounds = new THREE.Box3().setFromObject(this.alice.root);
    this.setRepresentation(this.representation);
    this.resize();
  }


  /**
   * Preview an owner-picked GLB/VRM entirely in this browser tab.
   * The canonical avatar manifest is deliberately never changed.
   */
  async loadCandidateFile(file) {
    validateCandidateFile(file);
    const bytes = await file.arrayBuffer();
    validateGlbHeader(bytes);
    const gltf = await getGLTFLoader().parseAsync(bytes, '');
    const report = inspectCandidateScene(gltf);
    const model = gltf.scene || gltf.scenes[0];
    const root = new THREE.Group();
    root.name = 'Alice_local_unapproved_candidate';
    root.add(model);
    const get = (name) => model.getObjectByName(name) || new THREE.Group();
    const state = {
      root, isProcedural: false, vrm: gltf.userData?.vrm || null, gltf,
      runtime: createArkitRuntime(gltf.userData?.vrm),
      headPivot: get('head'),
      eyeRigs: [], browLeft: new THREE.Group(), browRight: new THREE.Group(),
      mouth: new THREE.Group(), chestCore: get('spine'),
      arms: {
        left: { shoulder: get('leftShoulder'), elbow: get('leftLowerArm') },
        right: { shoulder: get('rightShoulder'), elbow: get('rightLowerArm') },
      },
      morphMeshes: [],
      mixer: null,
    };
    model.traverse((obj) => {
      if (obj.isMesh) {
        obj.frustumCulled = false;
        if (obj.morphTargetDictionary) state.morphMeshes.push(obj);
      }
    });
    // Start only when a real clip exists; never infer that imported animation works.
    if (gltf.animations?.length) {
      state.mixer = new THREE.AnimationMixer(model);
      state.mixer.clipAction(gltf.animations[0]).play();
    }
    // Load and inspect before replacing the currently visible character.
    const previous = this.alice;
    this.scene.add(root);
    this.alice = state;
    if (previous?.root) this.scene.remove(previous.root);
    this.setRepresentation(this.representation);
    this.desktopBounds = new THREE.Box3().setFromObject(root);
    this.resize();
    return report;
  }

  #addLights() {
    // Rig 1: Labor-Licht für den prozeduralen Körper und GLaDOS (unverändert).
    const lab = new THREE.Group();
    lab.name = 'lab-lights';
    lab.add(new THREE.HemisphereLight('#e8efec', '#17110f', 0.82));

    const key = new THREE.DirectionalLight('#ffe9dc', 3.35);
    key.position.set(-2.8, 3.7, 4.1);
    key.castShadow = true;
    key.shadow.mapSize.set(1536, 1536);
    key.shadow.bias = -0.0004;
    lab.add(key);

    const fill = new THREE.PointLight('#cfd9d7', 1.8, 7, 2);
    fill.position.set(2.5, 0.8, 3.2);
    lab.add(fill);

    const rim = new THREE.PointLight(cyan, 6.8, 7, 2);
    rim.position.set(2.4, 1.8, -1.7);
    lab.add(rim);

    const warm = new THREE.PointLight(amber, 2.2, 5.5, 2);
    warm.position.set(-2.4, -0.1, 1.4);
    lab.add(warm);
    this.scene.add(lab);

    // Rig 2: Studio-Licht für das Brustbild des gerigten VRM. Die Farben stammen aus der Figur:
    // warmes Hauptlicht, Lavendel (Jacke) als Kante von rechts, Kupfer (Haar) als schwache Gegenkante.
    const studio = new THREE.Group();
    studio.name = 'studio-lights';
    studio.add(new THREE.HemisphereLight('#e7e1f5', '#1b1322', 0.9));

    const studioKey = new THREE.DirectionalLight('#fff1e6', 2.5);
    studioKey.position.set(-1.4, 2.6, 3.4);
    studio.add(studioKey);

    const studioFill = new THREE.DirectionalLight('#cfc8ff', 0.75);
    studioFill.position.set(2.8, 0.4, 2.6);
    studio.add(studioFill);

    const studioRim = new THREE.DirectionalLight('#b9a3ff', 2.4);
    studioRim.position.set(2.4, 2.2, -2.8);
    studio.add(studioRim);

    const kicker = new THREE.DirectionalLight('#ff9a62', 1.3);
    kicker.position.set(-2.6, 1.4, -2.2);
    studio.add(kicker);
    studio.visible = false;
    this.scene.add(studio);

    this.lights = { lab, studio, key };
  }

  /**
   * Brustbild-Modus: nur für gerigte VRM-Avatare in der Desktop-Ansicht. Der Körper-Raum (Boden, Wand, Sockel)
   * wird ausgeblendet, der Canvas ist transparent; die Seite liefert Hintergrund und Voice-Aura per CSS.
   * XR und GLaDOS behalten die bisherige Bühne.
   */
  #bustActive() {
    return Boolean(this.alice?.vrm) && this.mode === 'desktop' && this.representation !== 'glados';
  }

  #applyStage() {
    const bust = this.#bustActive();
    const inAr = this.mode === 'ar';
    this.lab.visible = !bust && !inAr;
    this.scene.background = bust || inAr ? null : new THREE.Color('#050607');
    this.scene.fog = bust || inAr ? null : new THREE.FogExp2('#050607', 0.085);
    this.renderer.toneMappingExposure = bust ? 1.0 : 0.9;
    if (this.lights) {
      this.lights.lab.visible = !bust;
      this.lights.studio.visible = bust;
      this.lights.key.castShadow = !bust;
    }
    this.canvas.dataset.stage = bust ? 'bust' : 'room';
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
    this.#applyStage();
    this.lab.visible = mode !== 'ar';
    this.scene.background = mode === 'ar' ? null : new THREE.Color('#050607');
    this.scene.fog = mode === 'ar' ? null : new THREE.FogExp2('#050607', 0.085);
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
      this.lab.position.y = 0;
      this.#applyStage();
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

  /** Vokalgewichte aus echtem Audio (LipSync). Veralten nach 250 ms; dann greift die Energie-Näherung. */
  setVisemes(visemes, volume = 0) {
    this.liveVisemes = cleanVisemes(visemes);
    this.liveVolume = THREE.MathUtils.clamp(Number(volume) || 0, 0, 1);
    this.liveVisemeAt = performance.now();
  }

  setRepresentation(mode = 'french') {
    const normalized = ['glados', 'hev', 'whisper', 'french'].includes(mode) ? mode : 'french';
    this.representation = normalized;
    if (!this.alice || !this.glados) return normalized;

    const useGlados = normalized === 'glados';
    this.alice.root.visible = !useGlados;
    this.glados.root.visible = useGlados;

    if (this.alice.isProcedural && this.alice.materials) {
      const { garment, garmentShadow, cyan: coreMaterial } = this.alice.materials;
      if (normalized === 'hev') {
        garment.color.set('#c9682a');
        garmentShadow.color.set('#2a3137');
        coreMaterial.color.set('#61bce8');
        this.alice.chestCore.visible = true;
      } else {
        garment.color.set('#ddd9d1');
        garmentShadow.color.set('#aaa59e');
        coreMaterial.color.set('#7f8b89');
        this.alice.chestCore.visible = false;
      }
    }

    const activeRoot = useGlados ? this.glados.root : this.alice.root;
    activeRoot.updateMatrixWorld(true);
    this.desktopBounds = new THREE.Box3().setFromObject(activeRoot);
    this.resize();
    return normalized;
  }

  stopPlan() {
    this.performance = null;
    this.gesture = 'attentive';
  }

  resize = () => {
    const width = this.canvas.clientWidth || globalThis.innerWidth || 1;
    const height = this.canvas.clientHeight || globalThis.innerHeight || 1;
    this.#applyStage();
    const bust = this.#bustFrame(width, height);
    const size = this.desktopBounds ? this.desktopBounds.getSize(new THREE.Vector3()) : new THREE.Vector3(1.5, 1.8, 1);
    const center = this.desktopBounds ? this.desktopBounds.getCenter(new THREE.Vector3()) : new THREE.Vector3(0, 0.9, 0);
    const desktopPortrait = this.mode === 'desktop';
    const frame = bust || calculatePerspectiveFrame({
      viewportWidth: width,
      viewportHeight: height,
      verticalFovDegrees: this.camera.fov,
      boundsWidth: size.x,
      boundsHeight: desktopPortrait ? size.y * ((width / height) < 0.72 ? 0.76 : 0.64) : size.y,
      boundsDepth: size.z,
      padding: desktopPortrait ? 1.0 : 1.2,
      minimumDistance: desktopPortrait ? 2.05 : 3.35,
    });

    this.camera.aspect = frame.aspect;
    this.camera.updateProjectionMatrix();
    if (this.mode === 'desktop') {
      const targetY = bust ? bust.targetY : center.y + size.y * 0.24;
      const x = bust ? bust.x : center.x;
      const z = bust ? bust.z : center.z;
      this.frame = { x, y: targetY, z: z + frame.distance, targetY, lookZ: z };
      this.#applyFrame();
    }
    this.renderer.setSize(width, height, false);
  };

  /** Brustbild: Kopf und Schultern füllen den Bildschirm, bis zur Brust sichtbar. Maße relativ zur Kopfhöhe. */
  #bustFrame(width, height) {
    if (!this.#bustActive() || !this.desktopBounds) return null;
    const head = this.alice.vrm.humanoid?.getNormalizedBoneNode?.('head');
    if (!head) return null;
    this.alice.root.updateMatrixWorld(true);
    head.getWorldPosition(this.#headWorld);
    const top = this.desktopBounds.max.y;
    // Abstand Kopfgelenk bis Scheitel ≈ eine Kopfhöhe; begrenzt gegen fehlerhafte Bounds.
    const h = THREE.MathUtils.clamp(top - this.#headWorld.y, 0.12, 0.45);
    const aspect = width / height;
    const narrow = aspect < 0.8;
    const span = h * (narrow ? 5.0 : 3.9);
    const frameTop = top + h * (narrow ? 0.85 : 0.65);
    const distance = span / (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2));
    return {
      aspect,
      distance,
      targetY: frameTop - span / 2,
      x: this.#headWorld.x,
      z: this.#headWorld.z,
    };
  }

  #applyFrame() {
    const f = this.frame;
    if (!f || this.mode !== 'desktop') return;
    this.camera.position.set(f.x + this.parallax.x, f.y + this.parallax.y, f.z);
    this.camera.lookAt(f.x, f.targetY, f.lookZ);
  }

  #render = (time, frame) => {
    const delta = Math.min(0.05, this.clock.getDelta());
    this.#updateHitTest(frame);
    this.alice?.mixer?.update(delta);
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

  /** Kamera-Parallaxe zum Zeiger und Voice-Aura (CSS-Variable --voice) – beides ohne React-State. */
  #updateStage(delta, timedPerformance) {
    if (this.mode === 'desktop' && this.frame) {
      this.parallax.x = damp(this.parallax.x, this.pointer.x * 0.06, 3, delta);
      this.parallax.y = damp(this.parallax.y, this.pointer.y * 0.03, 3, delta);
      this.#applyFrame();
    }
    const live = this.liveVisemes && performance.now() - this.liveVisemeAt < 250 ? this.liveVolume : 0;
    const target = Math.max(this.speechEnergy, live, timedPerformance ? 0.18 : 0);
    this.aura = damp(this.aura, Math.min(1, target), target > this.aura ? 9 : 4, delta);
    const host = this.overlayRoot || this.canvas.parentElement;
    const shown = Math.round(this.aura * 100) / 100;
    if (host && shown !== this.auraShown) {
      host.style.setProperty('--voice', String(shown));
      this.auraShown = shown;
    }
  }

  #animate(time, delta) {
    if (!this.alice) return;
    const seconds = time / 1000;
    const elapsed = this.performance ? time - this.performanceStartedAt : 0;
    const timedPerformance = Boolean(this.performance && elapsed < this.performance.duration_ms);
    this.#updateStage(delta, timedPerformance);

    if (this.representation === 'glados') {
      const speaking = timedPerformance || this.speechEnergy > 0.035;
      const syntheticEnergy = timedPerformance ? 0.16 + Math.abs(Math.sin(elapsed * 0.019)) * 0.46 : 0;
      const energy = Math.max(this.speechEnergy, syntheticEnergy);
      const { root, headPivot, eye, eyeMaterial } = this.glados;
      root.position.y = 0.08 + Math.sin(seconds * 0.82) * 0.045;
      root.rotation.z = Math.sin(seconds * 0.5) * 0.045;
      headPivot.rotation.y = damp(headPivot.rotation.y, this.pointer.x * 0.08, 4.5, delta);
      headPivot.rotation.x = damp(headPivot.rotation.x, -this.pointer.y * 0.045, 4.5, delta);
      eye.scale.setScalar(1 + (speaking ? energy * 0.42 : Math.sin(seconds * 1.8) * 0.025));
      eyeMaterial.emissiveIntensity = 3.4 + (speaking ? energy * 10 : 0);
      if (timedPerformance && elapsed >= this.performance.duration_ms - 40) this.stopPlan();
      return;
    }

    const { headPivot, eyeRigs, browLeft, browRight, mouth, chestCore, arms, root, isProcedural, vrm } = this.alice;
    const xrCamera = this.renderer.xr.isPresenting ? this.renderer.xr.getCamera() : this.camera;
    const userX = this.mode === 'desktop' ? this.presence.x * 0.22 + this.pointer.x * 0.08 : 0;
    const userY = this.mode === 'desktop' ? this.presence.y * 0.14 + this.pointer.y * 0.05 : 0;
    const targetYaw = THREE.MathUtils.clamp(userX, -0.28, 0.28);
    const targetPitch = THREE.MathUtils.clamp(-userY, -0.18, 0.18);

    const speaking = timedPerformance || this.speechEnergy > 0.035;
    const micro = sampleMicroMotion(seconds, { speaking });

    headPivot.rotation.y = damp(headPivot.rotation.y, targetYaw + micro.headNoiseYaw, 5.5, delta);
    headPivot.rotation.x = damp(headPivot.rotation.x, targetPitch + micro.headNoisePitch, 5.5, delta);
    headPivot.rotation.z = damp(headPivot.rotation.z, micro.sway * 1.25, 3.2, delta);

    const blink = Math.min(micro.blinkOpen, 1 - (this.presence.blink || 0) * 0.55);
    // @ts-ignore
    if (isProcedural && eyeRigs) {
      eyeRigs.forEach(({ group, white }) => {
        group.rotation.y = damp(group.rotation.y, targetYaw * 0.75 + micro.eyeYaw, 10, delta);
        group.rotation.x = damp(group.rotation.x, targetPitch * 0.7 + micro.eyePitch, 10, delta);
        white.scale.y = damp(white.scale.y, 0.72 * blink, 22, delta);
      });
    }

    const syntheticEnergy = timedPerformance ? 0.16 + Math.abs(Math.sin(elapsed * 0.019)) * 0.46 : 0;
    const speechEnergy = Math.max(this.speechEnergy, syntheticEnergy);
    if (isProcedural && mouth) {
      mouth.scale.y = damp(mouth.scale.y, speaking ? 0.14 + speechEnergy * 0.55 : this.presence.expression === 'smile' ? 0.1 : 0.06, 18, delta);
      mouth.scale.x = damp(mouth.scale.x, this.presence.expression === 'smile' ? 1.35 : 1.15, 8, delta);
    }
    // glTF morph targets: update only names present on the actual imported mesh.
    if (!isProcedural && !vrm && this.alice.morphMeshes?.length) {
      const visemePhase = speaking ? (Math.sin(seconds * 11.2) + 1) * 0.5 : 0;
      const weights = {
        jaw: speaking ? speechEnergy : 0,
        vowelA: speaking ? speechEnergy * (0.68 + visemePhase * 0.22) : 0,
        vowelI: speaking ? speechEnergy * (1 - visemePhase) * 0.22 : 0,
        vowelU: speaking ? speechEnergy * visemePhase * 0.16 : 0,
        blink: 1 - blink,
        smile: this.presence.expression === 'smile' ? 0.7 : 0,
        browRaise: this.presence.expression === 'curious' ? 0.45 : 0,
      };
      for (const mesh of this.alice.morphMeshes) {
        for (const [name, index] of Object.entries(mesh.morphTargetDictionary || {})) {
          const target = resolveMorphWeight(name, weights);
          if (target !== undefined) {
            mesh.morphTargetInfluences[index] = damp(
              mesh.morphTargetInfluences[index] || 0, target, 14, delta,
            );
          }
        }
      }
    }
    const runtime = this.alice.runtime;
    if (vrm && runtime) {
      this.#driveRuntime(runtime, { delta, seconds, speaking, speechEnergy, camera: xrCamera });
    } else if (vrm) {
      const expressionManager = vrm.expressionManager;
      if (expressionManager) {
        const visemePhase = speaking ? (Math.sin(seconds * 11.2) + 1) * 0.5 : 0;
        expressionManager.setValue('aa', speaking ? speechEnergy * (0.68 + visemePhase * 0.22) : 0);
        expressionManager.setValue('ih', speaking ? speechEnergy * (1 - visemePhase) * 0.22 : 0);
        expressionManager.setValue('ou', speaking ? speechEnergy * visemePhase * 0.16 : 0);
        expressionManager.setValue('blink', 1 - blink);
        expressionManager.setValue('happy', this.presence.expression === 'smile' ? 1 : 0);
        expressionManager.update();
      }
      vrm.update(delta);
    }
    if (chestCore && isProcedural) {
      chestCore.scale.setScalar(1 + (speaking ? speechEnergy * 0.15 : Math.sin(seconds * 1.4) * 0.025));
    }

    const curious = this.presence.expression === 'curious' || this.performance?.dialogue_act === 'question' || this.performance?.emotion === 'curious';
    if (isProcedural && browLeft && browRight) {
      browLeft.rotation.z = damp(browLeft.rotation.z, curious ? -0.12 : 0, 7, delta);
      browRight.rotation.z = damp(browRight.rotation.z, curious ? 0.12 : 0, 7, delta);
      browLeft.position.y = damp(browLeft.position.y, curious ? 0.025 : 0, 7, delta);
      browRight.position.y = damp(browRight.position.y, curious ? 0.025 : 0, 7, delta);
    }

    // Raw-bone gestures were authored for the procedural body; ARKit-rigged VRMs pose via #driveRuntime.
    if (!runtime) this.#animateGesture(arms, delta, speaking);
    root.rotation.z = micro.sway;
    if (isProcedural) {
      const breathLift = micro.breath * (speaking ? 0.0025 : 0.004);
      arms.left.shoulder.position.y = damp(arms.left.shoulder.position.y, 0.66 + breathLift, 3.2, delta);
      arms.right.shoulder.position.y = damp(arms.right.shoulder.position.y, 0.66 + breathLift, 3.2, delta);
    }

    if (this.renderer.xr.isPresenting && (this.mode !== 'ar' || this.arPlaced)) {
      const cameraPosition = new THREE.Vector3();
      xrCamera.getWorldPosition(cameraPosition);
      const direction = cameraPosition.clone().sub(root.position);
      const targetRotation = Math.atan2(direction.x, direction.z);
      root.rotation.y = damp(root.rotation.y, targetRotation, 2.5, delta);
    }

    if (timedPerformance && elapsed >= this.performance.duration_ms - 40) this.stopPlan();
  }

  #headWorld = new THREE.Vector3();
  #gazeTarget = new THREE.Vector3();
  #armAngle = 1.2;

  /**
   * Per-frame drive for ARKit-rigged VRM 1.0 avatars. Order matters: runtime.update() writes
   * expressions and normalized head/spine bones, then the arm pose, then vrm.update().
   * Vowel weights come from real audio formants (LipSync) when fresh, else from an energy-based
   * approximation. Neither is phoneme recognition.
   */
  #driveRuntime(runtime, { delta, seconds, speaking, speechEnergy, camera }) {
    const { vrm } = this.alice;
    const liveFresh = this.liveVisemes && performance.now() - this.liveVisemeAt < 250;
    if (liveFresh) {
      runtime.setVisemes(this.liveVisemes);
    } else {
      // Rückfall ohne PCM-Zugriff (z. B. Browser-Sprachausgabe): Näherung aus Lautstärke und Takt.
      const phase = speaking ? (Math.sin(seconds * 11.2) + 1) * 0.5 : 0;
      runtime.setVisemes({
        aa: speaking ? speechEnergy * (0.6 + phase * 0.25) : 0,
        ih: speaking ? speechEnergy * (1 - phase) * 0.2 : 0,
        ou: speaking ? speechEnergy * phase * 0.16 : 0,
        ee: speaking ? speechEnergy * (1 - phase) * 0.1 : 0,
        oh: speaking ? speechEnergy * phase * 0.2 : 0,
      });
    }
    runtime.setSpeechEnergy(speaking ? speechEnergy : 0);

    const [emotion, amount] = this.presence.expression === 'smile'
      ? ['happy', 0.7]
      : (RUNTIME_EMOTIONS[this.performance?.emotion] || [null, 0]);
    runtime.setEmotion(emotion, amount);

    // Eye contact with the viewer; the pointer nudges the gaze a little.
    camera.getWorldPosition(this.#gazeTarget);
    this.#gazeTarget.x += this.pointer.x * 0.35;
    this.#gazeTarget.y += this.pointer.y * 0.2;
    runtime.setLookTarget(this.#gazeTarget);
    runtime.update(delta);

    this.#armAngle = damp(this.#armAngle, RUNTIME_ARM_ANGLE[this.gesture] ?? 1.2, 6, delta);
    const left = vrm.humanoid?.getNormalizedBoneNode('leftUpperArm');
    const right = vrm.humanoid?.getNormalizedBoneNode('rightUpperArm');
    if (left) left.rotation.z = -this.#armAngle;
    if (right) right.rotation.z = this.#armAngle;
    vrm.update(delta);
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
