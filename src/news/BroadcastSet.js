import * as THREE from 'three';

// Immersive, self-contained broadcast set. No external textures or model downloads.
const mat = (color, metalness = 0.15, roughness = 0.5) =>
  new THREE.MeshStandardMaterial({ color, metalness, roughness });
const glow = (color, power = 1) =>
  new THREE.MeshBasicMaterial({ color, toneMapped: false });

function block(parent, name, size, position, material) {
  const object = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  object.name = name;
  object.position.set(...position);
  object.castShadow = true;
  object.receiveShadow = true;
  parent.add(object);
  return object;
}
function cylinder(parent, name, radius, depth, position, material, segments = 64) {
  const object = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, depth, segments), material);
  object.name = name;
  object.position.set(...position);
  object.castShadow = true;
  object.receiveShadow = true;
  parent.add(object);
  return object;
}
function textTexture({ title, eyebrow, footer, accent = '#57d9ed', compact = false }) {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('broadcast-canvas-unavailable');
  const bg = ctx.createLinearGradient(0, 0, 1024, 512);
  bg.addColorStop(0, '#101d30');
  bg.addColorStop(0.48, '#081422');
  bg.addColorStop(1, '#02070f');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 1024, 512);
  ctx.strokeStyle = 'rgba(117,202,230,.13)';
  ctx.lineWidth = 1;
  for (let x = 0; x < 1024; x += 64) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 512); ctx.stroke();
  }
  for (let y = 0; y < 512; y += 64) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(1024, y); ctx.stroke();
  }
  for (let k = 0; k < 5; k += 1) {
    ctx.strokeStyle = 'rgba(62,150,194,' + (0.25 - k * .035) + ')';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(790, 260, 115 + k * 32, 95 + k * 20, -0.2, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.fillStyle = accent;
  ctx.fillRect(50, 52, 7, 58);
  ctx.font = '600 28px Arial,sans-serif';
  ctx.letterSpacing = '5px';
  ctx.fillText((eyebrow || 'ALICE NETWORK').toUpperCase(), 74, 93);
  ctx.fillStyle = '#f4f7fc';
  ctx.font = '800 ' + (compact ? 53 : 75) + 'px Arial,sans-serif';
  const lines = [];
  const words = String(title || 'PARALLAX NEWS').trim().split(/\s+/);
  let current = '';
  for (const word of words) {
    const candidate = current ? current + ' ' + word : word;
    if (ctx.measureText(candidate).width > (compact ? 600 : 760) && current) {
      lines.push(current);
      current = word;
    } else current = candidate;
    if (lines.length >= 2) break;
  }
  if (current && lines.length < 3) lines.push(current);
  ctx.font = '800 ' + (compact ? 53 : 75) + 'px Arial,sans-serif';
  lines.slice(0, 3).forEach((line, i) => ctx.fillText(line.slice(0, 29).toUpperCase(), 51, 222 + i * (compact ? 72 : 90), 895));
  ctx.fillStyle = accent;
  ctx.fillRect(52, 434, 215, 5);
  ctx.fillStyle = '#9eb8cf';
  ctx.font = '600 21px Arial,sans-serif';
  ctx.fillText((footer || 'UNABHÄNGIG · DIGITAL · LIVE').toUpperCase(), 52, 478, 910);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

export function createBroadcastSet() {
  const root = new THREE.Group();
  root.name = 'ALICE_BROADCAST_STUDIO_V1';
  const midnight = mat('#0b101b', 0.45, 0.31);
  const graphite = mat('#181d2b', 0.42, 0.38);
  const steel = mat('#344258', 0.82, 0.27);
  const glass = new THREE.MeshPhysicalMaterial({
    color: '#142d46', metalness: 0.26, roughness: 0.18,
    transparent: true, opacity: 0.89, clearcoat: 0.9,
  });
  const electric = glow('#50d4eb');
  const warm = glow('#ff435e');
  const standby = glow('#324052');
  const screenBack = mat('#0a1627', 0.2, 0.62);
  const generatedTextures = [];
  const displays = [];

  // Raised, camera-safe stage and subtly reflective flooring.
  cylinder(root, 'round-stage', 6.4, 0.13, [0, -1.24, -0.2], midnight, 96);
  cylinder(root, 'stage-riser', 2.55, 0.045, [0, -1.145, -0.18], graphite, 96);
  const line = new THREE.Mesh(
    new THREE.TorusGeometry(2.56, 0.015, 8, 96),
    electric,
  );
  line.rotation.x = Math.PI / 2;
  line.position.set(0, -1.12, -0.18);
  root.add(line);

  // Rear cyclorama with vertical light ribs and angled architectural wings.
  block(root, 'cyclorama', [9.8, 4.8, 0.16], [0, 0.65, -3.75], midnight);
  for (let side of [-1, 1]) {
    const wing = block(root, 'wing-' + side, [2.5, 4.9, 0.15], [side * 5.15, 0.68, -2.1], graphite);
    wing.rotation.y = side * 0.68;
    for (let i = 0; i < 4; i += 1) {
      block(root, 'rib-' + side + '-' + i, [0.045, 3.8, .07], [side * (3.35 + i * .48), 0.7, -3.55 + i * .34], i % 2 ? steel : electric);
    }
  }

  // Big LED wall behind Alice; flank screens give the set its newsroom depth.
  function addDisplay(name, x, y, z, w, h, rotation, settings) {
    const carrier = new THREE.Group();
    carrier.name = name;
    carrier.position.set(x, y, z);
    carrier.rotation.y = rotation;
    root.add(carrier);
    block(carrier, 'panel-frame', [w + 0.12, h + 0.12, 0.14], [0, 0, -0.08], steel);
    block(carrier, 'panel-back', [w, h, 0.02], [0, 0, 0], screenBack);
    const texture = textTexture(settings);
    generatedTextures.push(texture);
    const face = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ map: texture, toneMapped: false }),
    );
    face.position.z = 0.021;
    face.name = name + '-screen';
    carrier.add(face);
    displays.push({ name, face, settings });
    return face;
  }
  addDisplay('main-led-wall', 0, 1.05, -3.46, 5.65, 2.38, 0, {
    title: 'PARALLAX NEWS', eyebrow: 'ALICE · NEWSROOM', footer: 'DIE WELT IM BLICK',
  });
  addDisplay('left-info-wall', -4.0, .84, -2.62, 1.96, 2.43, .27, {
    title: 'WELT & WISSEN', eyebrow: 'LIVE FEED', footer: 'REDAKTION',
    compact: true,
  });
  addDisplay('right-story-wall', 4.0, .84, -2.62, 1.96, 2.43, -.27, {
    title: 'AKTUELLE THEMEN', eyebrow: 'NEWS DESK', footer: 'QUELLEN · PRÜFUNG',
    compact: true,
  });

  // Anchor desk: narrow profile so facial animation is never obscured.
  const top = block(root, 'anchor-desk-top', [2.85, .095, .88], [0, -.14, .76], mat('#2d384a', .54, .2));
  top.castShadow = true;
  block(root, 'anchor-desk-body', [2.52, .64, .63], [0, -.57, .81], glass);
  block(root, 'anchor-desk-light-strip', [2.49, .035, .035], [0, -.45, 1.145], electric);
  const deskDisplay = addDisplay('desk-brand', 0, -.57, 1.155, 1.7, .29, 0, {
    title: 'PARALLAX', eyebrow: 'ON AIR', footer: 'ALICE',
    accent: '#54d7e9', compact: true,
  });
  deskDisplay.material.depthWrite = false;

  // Two practical studio cameras for visible wide shots.
  for (let side of [-1, 1]) {
    const base = new THREE.Group();
    base.name = side < 0 ? 'camera-two' : 'camera-three';
    base.position.set(side * 3.0, -1.0, 2.0);
    base.rotation.y = -side * .34;
    root.add(base);
    cylinder(base, 'camera-pedestal', .16, .11, [0, 0, 0], graphite, 24);
    cylinder(base, 'camera-column', .045, 1.13, [0, .62, 0], steel, 18);
    const body = block(base, 'camera-body', [.5, .33, .5], [0, 1.28, 0], graphite);
    body.castShadow = true;
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(.13, .16, .32, 20), steel);
    lens.rotation.x = Math.PI / 2;
    lens.position.set(0, 1.3, -.38);
    base.add(lens);
    block(base, 'camera-tally', [.14, .045, .05], [0, 1.51, -.13], warm);
    for (let d of [-1, 1]) {
      const foot = block(base, 'tripod-foot', [.07, .06, .55], [d * .2, -.04, .22], steel);
      foot.rotation.y = d * .28;
    }
  }

  // Ceiling lighting bars; emissive meshes convey physical fixtures.
  for (let x of [-2.3, 0, 2.3]) {
    block(root, 'light-rig-' + x, [1.75, .06, .1], [x, 2.83, -.55], steel);
    block(root, 'softbox-' + x, [1.45, .045, .36], [x, 2.75, -.48], glow('#fff4dc'));
  }
  const tally = block(root, 'tally-sign', [1.05, .25, .08], [0, 2.54, -3.23], standby);
  const state = { onAir: false, headline: 'PARALLAX NEWS' };

  function setHeadline(headline) {
    state.headline = String(headline || 'PARALLAX NEWS').slice(0, 160);
    const current = displays.find((item) => item.name === 'right-story-wall');
    if (!current) return;
    const next = textTexture({
      title: state.headline, eyebrow: 'DAS THEMA', footer: 'PARALLAX NEWS',
      compact: true, accent: '#57d9ed',
    });
    generatedTextures.push(next);
    const material = current.face.material;
    const previous = material.map;
    material.map = next;
    material.needsUpdate = true;
    // Replaced textures must be disposed to avoid a leak during long broadcasts.
    if (previous) {
      const index = generatedTextures.indexOf(previous);
      if (index >= 0) generatedTextures.splice(index, 1);
      previous.dispose();
    }
  }
  function setOnAir(enabled) {
    state.onAir = Boolean(enabled);
    tally.material = state.onAir ? warm : standby;
    tally.name = state.onAir ? 'ON_AIR' : 'STANDBY';
  }
  function dispose() {
    generatedTextures.forEach((texture) => texture.dispose());
    standby.dispose();
    root.traverse((object) => {
      if (object.geometry) object.geometry.dispose();
      const materials = object.material ? (Array.isArray(object.material) ? object.material : [object.material]) : [];
      for (const material of materials) material.dispose();
    });
  }
  return { root, state, setHeadline, setOnAir, dispose };
}
