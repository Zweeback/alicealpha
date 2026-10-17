import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { getGLTFLoader } from '../xr/loader.js';

const vowels = {
  A: ['a', 'aa', 'viseme_aa', 'viseme_a', 'moutha'],
  I: ['i', 'ih', 'ii', 'viseme_ih', 'mouthi'],
  U: ['u', 'ou', 'uu', 'viseme_ou', 'mouthu'],
  E: ['e', 'ee', 'viseme_e', 'mouthe'],
  O: ['o', 'oh', 'viseme_oh', 'moutho'],
};
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const ink = (color, roughness = 0.74) => new THREE.MeshStandardMaterial({ color, roughness });
const ellipsoid = (parent, name, color, pos, scale, segs = 24) => {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, segs, 16), color);
  mesh.name = name;
  mesh.position.set(...pos);
  mesh.scale.set(...scale);
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
};
const bone = (parent, name, pos) => {
  const item = new THREE.Bone();
  item.name = name;
  item.position.set(...pos);
  parent.add(item);
  return item;
};

function mouthMesh() {
  const geometry = new THREE.SphereGeometry(0.072, 24, 12);
  const base = geometry.getAttribute('position');
  geometry.morphTargetsRelative = true;
  const presets = { a: [1, 4.6], i: [1.9, 1.6], u: [0.78, 3.0], e: [1.65, 2.2], o: [1.12, 3.6], smile: [1.8, 1.25] };
  for (const [name, [width, height]] of Object.entries(presets)) {
    const delta = new Float32Array(base.count * 3);
    for (let i = 0; i < base.count; i++) {
      delta[i * 3] = base.getX(i) * (width - 1);
      delta[i * 3 + 1] = base.getY(i) * (height - 1);
    }
    const attr = new THREE.Float32BufferAttribute(delta, 3);
    attr.name = name;
    geometry.morphAttributes.position.push(attr);
  }
  const mesh = new THREE.Mesh(geometry, ink('#622a36', 0.8));
  mesh.name = 'Alice_Mouth_Visemes';
  mesh.scale.set(1, 0.26, 0.24);
  mesh.position.set(0, -0.13, 0.338);
  return mesh;
}

export function createPoseableAlice() {
  const model = new THREE.Group();
  model.name = 'Alice_Procedural_Editable';
  const skin = ink('#e8b9a9');
  const hair = ink('#75355e');
  const coat = ink('#343548');
  const cloth = ink('#dadce4');
  const white = ink('#f5f6fb');
  const iris = ink('#5ca8c5');
  const joint = bone(model, 'hips', [0, -0.33, 0]);
  ellipsoid(joint, 'pelvis', coat, [0, 0, 0], [0.27, 0.2, 0.20]);
  const spine = bone(joint, 'spine', [0, 0.23, 0]);
  ellipsoid(spine, 'torso', coat, [0, 0.27, 0], [0.32, 0.46, 0.20]);
  const chest = bone(spine, 'chest', [0, 0.49, 0]);
  ellipsoid(chest, 'shirt', cloth, [0, -0.03, 0.19], [0.2, 0.18, 0.035]);
  const neck = bone(chest, 'neck', [0, 0.12, 0]);
  ellipsoid(neck, 'neck_mesh', skin, [0, 0.11, 0], [0.10, 0.16, 0.09]);
  const head = bone(neck, 'head', [0, 0.23, 0]);
  ellipsoid(head, 'face_sculpt', skin, [0, 0.16, 0.03], [0.245, 0.34, 0.26], 42);
  ellipsoid(head, 'hair_back', hair, [0, 0.2, -0.11], [0.29, 0.39, 0.24], 32);
  ellipsoid(head, 'hair_cap', hair, [0, 0.39, 0.0], [0.277, 0.16, 0.26], 32);
  for (const side of [-1, 1]) {
    ellipsoid(head, 'eye_white', white, [side * 0.09, 0.20, 0.253], [0.066, 0.05, 0.03]);
    ellipsoid(head, 'iris', iris, [side * 0.09, 0.2, 0.280], [0.033, 0.037, 0.012]);
    ellipsoid(head, 'brow', hair, [side * 0.09, 0.29, 0.26], [0.083, 0.018, 0.02]);
  }
  head.add(mouthMesh());
  for (const side of [-1, 1]) {
    const shoulder = bone(chest, side === -1 ? 'leftUpperArm' : 'rightUpperArm', [side * 0.32, 0.03, 0]);
    ellipsoid(shoulder, 'upper_arm', coat, [side * 0.21, 0, 0], [0.25, 0.105, 0.10]);
    const elbow = bone(shoulder, side === -1 ? 'leftLowerArm' : 'rightLowerArm', [side * 0.43, 0, 0]);
    ellipsoid(elbow, 'forearm', coat, [side * 0.19, 0, 0], [0.23, 0.083, 0.083]);
    const hand = bone(elbow, side === -1 ? 'leftHand' : 'rightHand', [side * 0.40, 0, 0]);
    ellipsoid(hand, 'hand_mesh', skin, [side * 0.08, 0, 0], [0.13, 0.075, 0.054]);
    const leg = bone(joint, side === -1 ? 'leftUpperLeg' : 'rightUpperLeg', [side * 0.16, -0.14, 0]);
    ellipsoid(leg, 'thigh', coat, [0, -0.27, 0], [0.15, 0.35, 0.16]);
    const knee = bone(leg, side === -1 ? 'leftLowerLeg' : 'rightLowerLeg', [0, -0.56, 0]);
    ellipsoid(knee, 'shin', coat, [0, -0.25, 0], [0.115, 0.32, 0.125]);
    const ankle = bone(knee, side === -1 ? 'leftFoot' : 'rightFoot', [0, -0.51, 0]);
    ellipsoid(ankle, 'shoe', cloth, [0, -0.045, 0.10], [0.14, 0.085, 0.26]);
  }
  return model;
}

export class AvatarWorkbench {
  constructor(canvas, onChange = () => {}) {
    this.canvas = canvas;
    this.onChange = onChange;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#10131b');
    this.camera = new THREE.PerspectiveCamera(39, 1, 0.05, 100);
    this.camera.position.set(2.7, 1.35, 4.4);
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.35;
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.target.set(0, 0.05, 0);
    this.controls.minDistance = 0.8;
    this.controls.maxDistance = 16;
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x6f7088, 2.0));
    const key = new THREE.DirectionalLight(0xffffff, 3.0);
    key.position.set(3, 6, 5);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0xa79aff, 2.3);
    rim.position.set(-3, 3, -3);
    this.scene.add(rim);
    const floor = new THREE.GridHelper(8, 30, 0x444957, 0x252934);
    floor.position.y = -1.5;
    this.scene.add(floor);
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.brushMode = 'orbit';
    this.brushRadius = 0.22;
    this.brushStrength = 0.025;
    this.undoStack = [];
    this.isPainting = false;
    this.currentStroke = null;
    this.viseme = null;
    this.vrm = null;
    this.type = 'procedural';
    this.bones = [];
    this._disposed = false;
    this._onDown = (event) => this.pointerDown(event);
    this._onMove = (event) => this.pointerMove(event);
    this._onUp = () => this.pointerUp();
    canvas.addEventListener('pointerdown', this._onDown);
    canvas.addEventListener('pointermove', this._onMove);
    window.addEventListener('pointerup', this._onUp);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas.parentElement);
    this.setModel(createPoseableAlice(), null, 'procedural');
    this.resize();
    this.clock = new THREE.Clock();
    this.frame();
  }

  resize() {
    if (this._disposed) return;
    const { width, height } = this.canvas.parentElement.getBoundingClientRect();
    if (!width || !height) return;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  notify() {
    const morphs = new Set();
    this.model?.traverse((obj) => {
      if (obj.isMesh && obj.morphTargetDictionary) Object.keys(obj.morphTargetDictionary).forEach((m) => morphs.add(m));
    });
    this.onChange({
      type: this.type,
      boneCount: this.bones.length,
      meshCount: this.countMeshes(),
      bones: this.bones.map((b) => b.name),
      morphs: [...morphs],
      canSculpt: this.countEditableMeshes() > 0,
      hasVrm: !!this.vrm,
    });
  }

  countMeshes() {
    let count = 0;
    this.model?.traverse((o) => { if (o.isMesh) count++; });
    return count;
  }

  countEditableMeshes() {
    let count = 0;
    this.model?.traverse((o) => { if (o.isMesh && !o.isSkinnedMesh && o.geometry?.attributes?.position && !o.geometry.morphAttributes?.position?.length) count++; });
    return count;
  }

  setModel(model, vrm = null, type = 'glb') {
    this.undoStack = [];
    if (this.model) this.scene.remove(this.model);
    this.model = model;
    this.vrm = vrm;
    this.type = type;
    this.model.name ||= 'Alice_Imported_Asset';
    this.scene.add(model);
    model.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(model);
    if (!bounds.isEmpty()) {
      const center = bounds.getCenter(new THREE.Vector3());
      const height = Math.max(0.001, bounds.getSize(new THREE.Vector3()).y);
      const scale = 2.55 / height;
      // Use a wrapper so imported bones, skins and transforms remain unchanged.
      if (this.framingWrapper) this.scene.remove(this.framingWrapper);
      this.scene.remove(model);
      this.framingWrapper = new THREE.Group();
      this.framingWrapper.name = 'Editor_Frame_Not_Exported';
      this.framingWrapper.position.set(-center.x * scale, -center.y * scale, -center.z * scale);
      this.framingWrapper.scale.setScalar(scale);
      this.framingWrapper.add(model);
      this.scene.add(this.framingWrapper);
    }
    this.bones = [];
    model.traverse((o) => { if (o.isBone) this.bones.push(o); });
    if (vrm?.humanoid) {
      const mapping = ['hips', 'spine', 'chest', 'neck', 'head', 'leftUpperArm', 'leftLowerArm', 'leftHand', 'rightUpperArm', 'rightLowerArm', 'rightHand', 'leftUpperLeg', 'leftLowerLeg', 'rightUpperLeg', 'rightLowerLeg'];
      for (const name of mapping) {
        const node = vrm.humanoid.getNormalizedBoneNode?.(name);
        if (node && !this.bones.includes(node)) { node.name ||= name; this.bones.push(node); }
      }
    }
    this.restPose = new Map(this.bones.map((b) => [b, b.quaternion.clone()]));
    this.notify();
  }

  async loadFile(file) {
    if (!file || !/\.(glb|vrm)$/i.test(file.name)) throw new Error('Nur .glb und .vrm werden unterstützt.');
    if (file.size > 80 * 1024 * 1024) throw new Error('Maximal 80 MB pro Modell.');
    const signature = new Uint8Array(await file.slice(0, 4).arrayBuffer());
    if (String.fromCharCode(...signature) !== 'glTF') throw new Error('Keine gültige GLB/VRM-Binärdatei.');
    const url = URL.createObjectURL(file);
    try {
      const gltf = await getGLTFLoader().loadAsync(url);
      const vrm = gltf.userData?.vrm || null;
      this.setModel(vrm?.scene || gltf.scene, vrm, vrm ? 'vrm' : 'glb');
      this.notify();
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  setBrush(mode, radius, strength) {
    this.brushMode = mode;
    this.brushRadius = clamp(Number(radius) || 0.2, 0.03, 1);
    this.brushStrength = clamp(Number(strength) || 0.02, 0.001, 0.2);
  }

  hit(event) {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    return this.raycaster.intersectObject(this.model, true).find(({ object }) =>
      object.isMesh && !object.isSkinnedMesh && !object.geometry.morphAttributes?.position?.length);
  }

  pointerDown(event) {
    if (this.brushMode === 'orbit' || event.button !== 0) return;
    const hit = this.hit(event);
    if (!hit) return;
    this.controls.enabled = false;
    this.isPainting = true;
    this.canvas.setPointerCapture?.(event.pointerId);
    const pos = hit.object.geometry.attributes.position;
    this.currentStroke = { mesh: hit.object, positions: Float32Array.from(pos.array) };
    this.applySculpt(hit);
  }

  pointerMove(event) {
    if (!this.isPainting) return;
    const hit = this.hit(event);
    if (hit?.object === this.currentStroke?.mesh) this.applySculpt(hit);
  }

  pointerUp() {
    if (this.currentStroke) {
      this.undoStack.push(this.currentStroke);
      if (this.undoStack.length > 20) this.undoStack.shift();
    }
    this.currentStroke = null;
    this.isPainting = false;
    this.controls.enabled = true;
  }

  applySculpt(hit) {
    const mesh = hit.object;
    const position = mesh.geometry.attributes.position;
    if (position.count > 160000) return;
    const center = mesh.worldToLocal(hit.point.clone());
    const scale = new THREE.Vector3();
    mesh.getWorldScale(scale);
    const localRadius = this.brushRadius / Math.max(0.001, (scale.x + scale.y + scale.z) / 3);
    const nearby = [];
    const centroid = new THREE.Vector3();
    for (let i = 0; i < position.count; i++) {
      const d = center.distanceTo(new THREE.Vector3(position.getX(i), position.getY(i), position.getZ(i)));
      if (d <= localRadius) {
        const weight = (1 - d / localRadius) ** 2;
        nearby.push([i, weight]);
        centroid.addScaledVector(new THREE.Vector3(position.getX(i), position.getY(i), position.getZ(i)), weight);
      }
    }
    if (!nearby.length) return;
    const weightSum = nearby.reduce((n, [, weight]) => n + weight, 0);
    centroid.multiplyScalar(1 / Math.max(0.001, weightSum));
    const normal = hit.face?.normal?.clone() || new THREE.Vector3(0, 0, 1);
    for (const [i, weight] of nearby) {
      const v = new THREE.Vector3(position.getX(i), position.getY(i), position.getZ(i));
      if (this.brushMode === 'smooth') v.lerp(centroid, this.brushStrength * 4 * weight);
      else v.addScaledVector(normal, this.brushStrength * weight * (this.brushMode === 'lower' ? -1 : 1));
      position.setXYZ(i, v.x, v.y, v.z);
    }
    position.needsUpdate = true;
    mesh.geometry.computeVertexNormals();
    mesh.geometry.computeBoundingSphere();
    mesh.geometry.computeBoundingBox();
  }

  undo() {
    const item = this.undoStack.pop();
    if (!item) return false;
    const attr = item.mesh.geometry.attributes.position;
    if (attr.array.length !== item.positions.length) return false;
    attr.array.set(item.positions);
    attr.needsUpdate = true;
    item.mesh.geometry.computeVertexNormals();
    item.mesh.geometry.computeBoundingSphere();
    item.mesh.geometry.computeBoundingBox();
    return true;
  }

  poseBone(name, axis, radians) {
    const target = this.bones.find((b) => b.name === name);
    if (!target || !['x', 'y', 'z'].includes(axis)) return;
    target.rotation[axis] = clamp(Number(radians) || 0, -Math.PI, Math.PI);
  }

  resetPose() {
    for (const [b, q] of this.restPose) b.quaternion.copy(q);
  }

  setExpression(name, weight = 1) {
    const normalized = norm(name);
    this.model.traverse((m) => {
      if (!m.morphTargetDictionary) return;
      for (const [key, index] of Object.entries(m.morphTargetDictionary)) {
        if ([normalized, 'mouth' + normalized].includes(norm(key))) m.morphTargetInfluences[index] = clamp(weight, 0, 1);
      }
    });
    if (this.vrm?.expressionManager?.getValue?.(name) !== null) this.vrm.expressionManager.setValue(name, clamp(weight, 0, 1));
  }

  setViseme(vowel, weight = 1) {
    const valid = Object.prototype.hasOwnProperty.call(vowels, vowel) ? vowel : null;
    const aliases = new Set(valid ? vowels[valid].map(norm) : []);
    this.model.traverse((m) => {
      if (!m.morphTargetDictionary) return;
      for (const [key, index] of Object.entries(m.morphTargetDictionary)) {
        if (Object.values(vowels).flat().map(norm).includes(norm(key))) {
          m.morphTargetInfluences[index] = aliases.has(norm(key)) ? clamp(weight, 0, 1) : 0;
        }
      }
    });
    if (this.vrm?.expressionManager) {
      const manager = this.vrm.expressionManager;
      for (const [key, names] of Object.entries({ A: ['aa', 'a'], I: ['ih', 'i'], U: ['ou', 'u'], E: ['ee', 'e'], O: ['oh', 'o'] })) {
        for (const candidate of names) {
          if (manager.getValue?.(candidate) !== null) manager.setValue(candidate, key === valid ? clamp(weight, 0, 1) : 0);
        }
      }
    }
    this.viseme = valid;
  }

  async exportGLB() {
    const exporter = new GLTFExporter();
    const data = await exporter.parseAsync(this.model, { binary: true, onlyVisible: true, trs: true });
    if (!(data instanceof ArrayBuffer)) throw new Error('GLB-Export lieferte keine Binärdatei.');
    return new Blob([data], { type: 'model/gltf-binary' });
  }

  frame = () => {
    if (this._disposed) return;
    this.frameId = requestAnimationFrame(this.frame);
    this.controls.update();
    if (this.vrm) this.vrm.update(this.clock.getDelta());
    else this.clock.getDelta();
    this.renderer.render(this.scene, this.camera);
  };

  dispose() {
    this._disposed = true;
    cancelAnimationFrame(this.frameId);
    this.canvas.removeEventListener('pointerdown', this._onDown);
    this.canvas.removeEventListener('pointermove', this._onMove);
    window.removeEventListener('pointerup', this._onUp);
    this.resizeObserver.disconnect();
    this.controls.dispose();
    this.renderer.dispose();
  }
}
