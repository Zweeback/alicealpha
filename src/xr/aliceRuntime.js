// alice_runtime.js - framework-free avatar driver for Alice (VRM 1.0 with the ARKit-52 / "Perfect Sync" expression set).
// No imports: pass the object you get from @pixiv/three-vrm (gltf.userData.vrm).
//
// Inputs (all optional, any mix):
//   setVisemes({aa,ih,ou,ee,oh})     vowel weights, e.g. from lipsync.js (audio) or from your TTS viseme events
//   setSpeechEnergy(0..1)            loudness, drives small head nods
//   setEmotion('happy', 0.8)         one emotion at a time ...      setAffect(valence -1..1, arousal 0..1)  ... or a 2-D dial
//   say('[happy] Hallo!')            parses LLM emotion tags like [happy], returns the text without the tags
//   setArkit({jawOpen: .4, ...})     raw ARKit weights 0..1: iPhone/iFacialMocap/MediaPipe FaceLandmarker/Audio2Face-3D output
//   setLookTarget(object3D | {x,y,z} world point | null)
// Layers: emotion smoothing, auto blink, saccades + head follow, breathing, ARKit input with hysteresis and
// mouth constraints. Call update(dt) once per frame BEFORE vrm.update(dt).
//
// Notes: eye blink and eye look are texture swaps in this model, so they are binary (thresholds with hysteresis).

export const ARKIT_52 = ['eyeBlinkLeft', 'eyeLookDownLeft', 'eyeLookInLeft', 'eyeLookOutLeft', 'eyeLookUpLeft', 'eyeSquintLeft', 'eyeWideLeft',
  'eyeBlinkRight', 'eyeLookDownRight', 'eyeLookInRight', 'eyeLookOutRight', 'eyeLookUpRight', 'eyeSquintRight', 'eyeWideRight',
  'jawForward', 'jawLeft', 'jawRight', 'jawOpen', 'mouthClose', 'mouthFunnel', 'mouthPucker', 'mouthLeft', 'mouthRight',
  'mouthSmileLeft', 'mouthSmileRight', 'mouthFrownLeft', 'mouthFrownRight', 'mouthDimpleLeft', 'mouthDimpleRight',
  'mouthStretchLeft', 'mouthStretchRight', 'mouthRollLower', 'mouthRollUpper', 'mouthShrugLower', 'mouthShrugUpper',
  'mouthPressLeft', 'mouthPressRight', 'mouthLowerDownLeft', 'mouthLowerDownRight', 'mouthUpperUpLeft', 'mouthUpperUpRight',
  'browDownLeft', 'browDownRight', 'browInnerUp', 'browOuterUpLeft', 'browOuterUpRight', 'cheekPuff', 'cheekSquintLeft',
  'cheekSquintRight', 'noseSneerLeft', 'noseSneerRight', 'tongueOut'];
export const EMOTIONS = ['happy', 'sad', 'angry', 'surprised', 'relaxed'];
const VISEMES = ['aa', 'ih', 'ou', 'ee', 'oh'];
const LOOKS = ['lookLeft', 'lookRight', 'lookUp', 'lookDown'];
const MANAGED = [...VISEMES, ...EMOTIONS, 'blink', ...LOOKS, ...ARKIT_52];
const BINARY_ARKIT = { eyeBlinkLeft: [0.55, 0.40], eyeBlinkRight: [0.55, 0.40], eyeLookDownLeft: [0.35, 0.25], eyeLookInLeft: [0.35, 0.25],
  eyeLookOutLeft: [0.35, 0.25], eyeLookUpLeft: [0.35, 0.25], eyeLookDownRight: [0.35, 0.25], eyeLookInRight: [0.35, 0.25],
  eyeLookOutRight: [0.35, 0.25], eyeLookUpRight: [0.35, 0.25] };
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const clamp01 = (x) => clamp(x, 0, 1);
const damp = (cur, target, tau, dt) => cur + (target - cur) * (1 - Math.exp(-dt / tau));
const rnd = (a, b) => a + Math.random() * (b - a);
const TAG_RE = /\[\s*(?:emotion\s*[:=]\s*)?(neutral|happy|sad|angry|surprised|relaxed)\s*\]/gi;

export class AliceRuntime {
  constructor(vrm, opts = {}) {
    this.vrm = vrm;
    this.opts = Object.assign({ blink: true, gaze: true, breathe: true, pose: true, saccades: true, headFollow: 0.6, mouthStrength: 1 }, opts);
    this.t = 0;
    this.visemes = { aa: 0, ih: 0, ou: 0, ee: 0, oh: 0 };
    this.energy = 0; this._energy = 0;
    this.emoTarget = { happy: 0, sad: 0, angry: 0, surprised: 0, relaxed: 0 };
    this.emoCur = { happy: 0, sad: 0, angry: 0, surprised: 0, relaxed: 0 };
    this.arousal = 0.3;
    this.arkit = {}; this.arkitAge = 99; this._ak = {};          // raw input, time since last input, smoothed + thresholded
    this.out = {};                                                 // last values written to the expression manager
    this.lookTarget = null;
    this._blink = { next: 1.5, t: -1 };
    this._sacc = { next: 1.0, yaw: 0, pitch: 0, until: 0 };
    this._gaze = { x: 0, y: 0 };                                   // quantised eye cell (+x = character's left, +y = up)
    this._head = { yaw: 0, pitch: 0 };
    this._V3 = null;
    this.manual = {};                                              // optional overrides {name: value}, merged with max()
  }

  // ---------------- inputs ----------------
  setVisemes(w) { for (const k of VISEMES) this.visemes[k] = clamp01(w[k] || 0); }
  setSpeechEnergy(e) { this.energy = clamp01(e); }
  setEmotion(name, amount = 0.8) {
    for (const k of EMOTIONS) this.emoTarget[k] = 0;
    if (EMOTIONS.includes(name)) this.emoTarget[name] = clamp01(amount);
  }
  setAffect(valence, arousal) {
    const v = clamp(valence, -1, 1), a = clamp01(arousal);
    this.arousal = a;
    const e = { happy: Math.max(0, v) * (0.45 + 0.55 * a), relaxed: Math.max(0, v) * (1 - a) * 0.8, sad: Math.max(0, -v) * (1 - a),
      angry: Math.max(0, -v) * a, surprised: Math.max(0, a - 0.6) * 2.0 * (1 - Math.abs(v)) };
    const s = EMOTIONS.reduce((q, k) => q + e[k], 0), n = s > 1 ? 1 / s : 1;
    for (const k of EMOTIONS) this.emoTarget[k] = clamp01(e[k] * n);
  }
  // 'say' strips [emotion] tags from LLM output, applies the last one and returns the clean text.
  say(text, amount = 0.8) {
    let last = null;
    const clean = String(text).replace(TAG_RE, (_, e) => { last = e.toLowerCase(); return ''; }).replace(/\s{2,}/g, ' ').trim();
    if (last) this.setEmotion(last, amount);
    return clean;
  }
  setArkit(w) { Object.assign(this.arkit, w); this.arkitAge = 0; }
  setArkitFromMediaPipe(categories) {            // FaceLandmarker result.faceBlendshapes[0].categories
    const w = {}; for (const c of categories) if (c.categoryName !== '_neutral') w[c.categoryName] = c.score;
    this.setArkit(w);
  }
  setLookTarget(t) { this.lookTarget = t; }
  get arkitActive() { return this.arkitAge < 0.4; }

  // ---------------- frame update ----------------
  update(dt) {
    dt = clamp(dt, 0.001, 0.1);
    this.t += dt; this.arkitAge += dt;
    this._energy = damp(this._energy, this.energy, 0.12, dt);
    const o = {};
    const ext = this.arkitActive;

    // emotions (slightly weaker while the mouth is busy, so smiles do not fight the vowels)
    const speak = clamp01(Math.max(this._energy, ...VISEMES.map((k) => this.visemes[k])));
    for (const k of EMOTIONS) {
      this.emoCur[k] = damp(this.emoCur[k], this.emoTarget[k], 0.16, dt);
      o[k] = this.emoCur[k] < 0.004 ? 0 : this.emoCur[k] * (1 - 0.3 * speak);
    }
    // visemes (the mouth strength option scales them)
    for (const k of VISEMES) o[k] = clamp01(this.visemes[k] * this.opts.mouthStrength);

    // ARKit input: smoothed per group, hysteresis for the texture-swap channels
    if (ext) {
      for (const n of ARKIT_52) {
        const raw = clamp01(this.arkit[n] || 0), prev = this._ak[n] || 0;
        const th = BINARY_ARKIT[n];
        if (th) { this._ak[n] = (raw > th[0] || (prev > 0.5 && raw > th[1])) ? 1 : 0; continue; }
        const tau = /^(jaw|mouth|tongue|cheekPuff)/.test(n) ? 0.03 : 0.07;
        this._ak[n] = damp(prev, raw, tau, dt);
      }
      for (const n of ARKIT_52) o[n] = this._ak[n];
    } else {
      for (const n of ARKIT_52) { this._ak[n] = BINARY_ARKIT[n] ? 0 : damp(this._ak[n] || 0, 0, 0.1, dt); o[n] = this._ak[n] < 0.004 ? 0 : this._ak[n]; }   // input expired: relax (binary channels snap)
    }
    // mouth constraint: lips can only close as far as the jaw is open (stops lip crossing)
    if (o.mouthClose > 0) o.mouthClose = Math.min(o.mouthClose, o.jawOpen);

    // blink (auto unless the ARKit input carries it)
    const ownBlink = this.opts.blink && !(ext && (this.arkit.eyeBlinkLeft !== undefined || this.arkit.eyeBlinkRight !== undefined));
    let blink = 0;
    if (ownBlink) {
      const b = this._blink;
      if (b.t < 0 && this.t > b.next) b.t = 0;
      if (b.t >= 0) {
        b.t += dt; blink = 1;
        if (b.t > 0.14) { b.t = -1; blink = 0; b.next = this.t + (rnd(2.2, 6.0) * (1 + 0.5 * speak)) / (1 + 0.6 * this.arousal); if (Math.random() < 0.15) b.next = this.t + 0.22; }
      }
    }
    o.blink = blink;

    // head follow + saccades -> binary eye cells
    this._pose(o, dt, ext);

    for (const k in this.manual) o[k] = Math.max(o[k] || 0, clamp01(this.manual[k]));
    const em = this.vrm.expressionManager;
    for (const n of MANAGED) { const v = o[n] || 0; this.out[n] = v; if (em) em.setValue(n, v); }
    return this.out;
  }

  _pose(o, dt, ext) {
    const h = this.vrm.humanoid; if (!h) return;
    const g = (n) => h.getNormalizedBoneNode(n);
    const head = g('head'), neck = g('neck');
    let yaw = 0, pitch = 0;                                         // direction to the target in the head frame (rad)
    if (this.lookTarget && head && this.opts.gaze) {
      const V3 = this._V3 || (this._V3 = head.position.constructor);
      const p = new V3(), q = new V3();
      if (typeof this.lookTarget.getWorldPosition === 'function') this.lookTarget.getWorldPosition(p); else p.set(this.lookTarget.x, this.lookTarget.y, this.lookTarget.z);
      head.getWorldPosition(q);
      this.vrm.scene.worldToLocal(p); this.vrm.scene.worldToLocal(q);
      q.y += 0.065;                                                  // eye height above the head bone
      p.sub(q);
      yaw = Math.atan2(p.x, p.z); pitch = Math.atan2(p.y, Math.hypot(p.x, p.z));
    }
    if (this.opts.pose) {
      const hf = this.opts.headFollow, t = this.t;
      const hy = clamp(yaw * hf, -0.5, 0.5), hp = clamp(-pitch * hf * 0.8, -0.25, 0.3);
      this._head.yaw = damp(this._head.yaw, hy, 0.25, dt); this._head.pitch = damp(this._head.pitch, hp, 0.25, dt);
      const nod = this._energy * 0.05 * (0.6 + 0.4 * Math.sin(t * 6.3));
      const jy = this.opts.breathe ? Math.sin(t * 0.6) * 0.035 + Math.sin(t * 0.23 + 1) * 0.02 : 0, jp = this.opts.breathe ? Math.sin(t * 0.45 + 1) * 0.015 : 0;
      const yawF = this._head.yaw + jy, pitF = this._head.pitch + jp + nod, tilt = this.opts.breathe ? Math.sin(t * 0.31) * 0.012 : 0;
      if (neck) neck.rotation.set(pitF * 0.4, yawF * 0.4, tilt * 0.4);
      if (head) head.rotation.set(pitF * 0.6, yawF * 0.6, tilt * 0.6);
      if (this.opts.breathe) {
        const c = g('chest'), u = g('upperChest'), ls = g('leftShoulder'), rs = g('rightShoulder'), s = Math.sin(t * 1.5);
        if (c) c.rotation.x = s * 0.012; if (u) u.rotation.x = s * 0.008;
        if (ls) ls.rotation.z = -s * 0.01; if (rs) rs.rotation.z = s * 0.01;
      }
    }
    // eyes: residual angle (target minus head) + saccade offset -> quantised look cell with hysteresis
    if (ext && ARKIT_52.some((n) => /^eyeLook/.test(n) && this.arkit[n] !== undefined)) { o.lookLeft = o.lookRight = o.lookUp = o.lookDown = 0; return; }
    if (!this.opts.gaze) { o.lookLeft = o.lookRight = o.lookUp = o.lookDown = 0; return; }
    const s = this._sacc;
    if (this.opts.saccades && this.t > s.next) {
      const engaged = !!this.lookTarget && Math.random() < 0.75;       // while looking at someone, mostly keep eye contact
      s.yaw = engaged ? 0 : (Math.random() < 0.6 ? (Math.random() < 0.5 ? -1 : 1) * rnd(0.17, 0.3) : 0);
      s.pitch = engaged ? 0 : (Math.random() < 0.4 ? (Math.random() < 0.5 ? -1 : 1) * rnd(0.1, 0.17) : 0);
      s.until = this.t + rnd(0.25, 0.8); s.next = this.t + rnd(0.9, 3.2);
    }
    if (this.t > s.until) { s.yaw = 0; s.pitch = 0; }
    const ey = yaw - this._head.yaw + s.yaw, ep = pitch + this._head.pitch + s.pitch;   // head pitch is +down, so the residual adds it
    const q = (v, cur, enter, exit) => (v > enter || (cur === 1 && v > exit)) ? 1 : (v < -enter || (cur === -1 && v < -exit)) ? -1 : 0;
    this._gaze.x = q(ey, this._gaze.x, 0.16, 0.09); this._gaze.y = q(ep, this._gaze.y, 0.12, 0.07);
    o.lookLeft = this._gaze.x > 0 ? 1 : 0; o.lookRight = this._gaze.x < 0 ? 1 : 0;
    o.lookUp = this._gaze.y > 0 ? 1 : 0; o.lookDown = this._gaze.y < 0 ? 1 : 0;
  }
}
