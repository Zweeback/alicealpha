// Vokalbasierte Lippensynchronisation: PCM-Frame -> Gewichte für aa / ih / ou / ee / oh.
//
// Verfahren: Die Lautstärke steuert die Gesamtöffnung, LPC-Formanten (F1/F2) wählen den Vokal.
// Das ist eine Näherung aus dem echten Audiosignal – keine Phonem-Erkennung und kein Wissen über den Text.
// Läuft auf Live-AnalyserNode-Daten oder auf vorab dekodiertem Audio, bei jeder Abtastrate.
// Quelle: Alice-Pipeline v0.5 (viewer/lipsync.js), hier als framework-freies Modul mit Tests.

export const VISEMES = Object.freeze(['aa', 'ih', 'ou', 'ee', 'oh']);

// Vokal-Prototypen einer weiblichen Stimme (Hz): [F1, F2]
const PROTOS = {
  aa: [850, 1250],
  ee: [580, 2350],
  ih: [360, 2650],
  oh: [520, 950],
  ou: [370, 920],
};
// Maximale Öffnung je Mundform
const GAIN = { aa: 1.0, oh: 0.9, ee: 0.75, ih: 0.55, ou: 0.85 };

const RING = 120; // ~2 s Lautstärkeverlauf für die Rauschgrenze

export class LipSync {
  constructor(opts = {}) {
    this.attack = opts.attack ?? 0.045; // Zeitkonstanten in Sekunden
    this.release = opts.release ?? 0.11;
    this.noiseFloor = 0;
    this._ring = new Float32Array(RING).fill(1);
    this._ri = 0;
    this.peak = 0;
    this.out = { aa: 0, ih: 0, ou: 0, ee: 0, oh: 0 };
    this.volume = 0;
    this.f1 = 0;
    this.f2 = 0;
    this.voiced = false;
  }

  reset() {
    for (const k in this.out) this.out[k] = 0;
    this.volume = 0;
    this.f1 = 0;
    this.f2 = 0;
    this.voiced = false;
  }

  // frame: Float32Array (mono PCM, ~20–40 ms), sr: Abtastrate, dt: Sekunden seit dem letzten Aufruf
  update(frame, sr, dt) {
    if (!frame || !frame.length || !(sr > 0)) {
      return this.#settle(null, dt);
    }
    const { rms, f1, f2, voiced } = analyzeFrame(frame, sr);

    // Rauschgrenze = leisester Frame der letzten ~2 s; Referenz folgt dem jüngsten Pegel (Auto-Gain)
    this._ring[this._ri++ % RING] = rms;
    let mn = 1;
    for (let i = 0; i < RING; i++) if (this._ring[i] < mn) mn = this._ring[i];
    this.noiseFloor = mn;
    this.peak = Math.max(rms, this.peak * Math.exp(-Math.max(dt, 1e-3) / 4));
    const gate = Math.min(0.03, Math.max(0.006, mn * 2.5));
    const ref = Math.max(0.04, Math.min(0.15, this.peak * 0.8));
    let open = Math.max(0, Math.min(1, (rms - gate) / ref));
    open = Math.pow(open, 0.75);
    this.volume = open;
    this.f1 = f1;
    this.f2 = f2;
    this.voiced = voiced;

    const target = { aa: 0, ih: 0, ou: 0, ee: 0, oh: 0 };
    if (open > 0.01) {
      let sum = 0;
      const w = {};
      for (const k in PROTOS) {
        const d1 = (Math.log(Math.max(f1, 150)) - Math.log(PROTOS[k][0])) / 0.20;
        const d2 = (Math.log(Math.max(f2, 400)) - Math.log(PROTOS[k][1])) / 0.26;
        w[k] = Math.exp(-0.5 * (d1 * d1 + d2 * d2));
        sum += w[k];
      }
      const voicedScale = voiced ? 1 : 0.45; // Reibelaute / Rauschen: kleinerer, ih-artiger Mund
      for (const k in PROTOS) {
        const share = sum > 1e-9 ? w[k] / sum : 0;
        target[k] = share * GAIN[k] * open * voicedScale;
      }
      if (!voiced) target.ih = Math.max(target.ih, 0.25 * open);
    }
    return this.#settle(target, dt);
  }

  #settle(target, dt) {
    const step = Math.max(dt || 0, 1e-3);
    for (const k in this.out) {
      const goal = target ? target[k] : 0;
      const tau = goal > this.out[k] ? this.attack : this.release;
      const a = 1 - Math.exp(-step / tau);
      this.out[k] += (goal - this.out[k]) * a;
    }
    if (!target) this.volume *= Math.exp(-step / this.release);
    return this.out;
  }
}

// ---------- DSP ----------
export function analyzeFrame(x, sr, opts = {}) {
  const n = x.length;
  let e = 0;
  for (let i = 0; i < n; i++) e += x[i] * x[i];
  const rms = Math.sqrt(e / n);
  if (rms < 1e-4) return { rms, f1: 0, f2: 0, voiced: false };

  // auf ~11 kHz dezimieren (Boxfilter)
  const dec = Math.max(1, Math.round(sr / 11025));
  const fs = sr / dec;
  const m = Math.floor(n / dec);
  if (m < 32) return { rms, f1: 0, f2: 0, voiced: false };
  const y = new Float64Array(m);
  for (let i = 0; i < m; i++) {
    let s = 0;
    for (let j = 0; j < dec; j++) s += x[i * dec + j];
    y[i] = s / dec;
  }
  // Pre-Emphasis + Hann-Fenster
  const z = new Float64Array(m);
  for (let i = 0; i < m; i++) {
    const prev = i > 0 ? y[i - 1] : 0;
    z[i] = (y[i] - 0.97 * prev) * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (m - 1)));
  }
  // Autokorrelation
  // Ordnung 10 verfolgt die Formanten bei hohen Grundtönen am robustesten (Scheingipfel bei höheren Ordnungen).
  const order = opts.order ?? Math.min(10, 2 + Math.round(fs / 1000));
  const r = new Float64Array(order + 1);
  for (let k = 0; k <= order; k++) {
    let s = 0;
    for (let i = 0; i < m - k; i++) s += z[i] * z[i + k];
    r[k] = s;
  }
  if (r[0] < 1e-9) return { rms, f1: 0, f2: 0, voiced: false };

  // Stimmhaftigkeit aus der Periodizität des dezimierten Rohsignals, Lag 2,5–12 ms
  const lo = Math.floor(fs * 0.0025);
  const hi = Math.min(m - 1, Math.floor(fs * 0.012));
  let r0 = 0;
  for (let i = 0; i < m; i++) r0 += y[i] * y[i];
  let best = 0;
  for (let lag = lo; lag <= hi; lag++) {
    let s = 0;
    for (let i = 0; i < m - lag; i++) s += y[i] * y[i + lag];
    if (s > best) best = s;
  }
  const voiced = r0 > 0 && best / r0 > 0.35;

  // Levinson-Durbin
  r[0] *= 1.0001;
  let a = new Float64Array(order + 1);
  a[0] = 1;
  let err = r[0];
  for (let i = 1; i <= order; i++) {
    let acc = r[i];
    for (let j = 1; j < i; j++) acc += a[j] * r[i - j];
    const k = -acc / err;
    const na = a.slice();
    for (let j = 1; j < i; j++) na[j] = a[j] + k * a[i - j];
    na[i] = k;
    a = na;
    err *= 1 - k * k;
    if (err < 1e-12) break;
  }
  // LPC-Betragsspektrum auf einem Raster, die ersten zwei Spitzen wählen
  const N = 220;
  const fLow = 200;
  const fHigh = 3600;
  const mag = new Float64Array(N);
  for (let g = 0; g < N; g++) {
    const f = fLow + ((fHigh - fLow) * g) / (N - 1);
    const w = (2 * Math.PI * f) / fs;
    let re = 0;
    let im = 0;
    for (let k = 0; k <= order; k++) {
      re += a[k] * Math.cos(w * k);
      im -= a[k] * Math.sin(w * k);
    }
    mag[g] = 1 / Math.sqrt(re * re + im * im + 1e-12);
  }
  const peaks = [];
  for (let g = 1; g < N - 1; g++) {
    if (mag[g] > mag[g - 1] && mag[g] >= mag[g + 1]) {
      peaks.push({ f: fLow + ((fHigh - fLow) * g) / (N - 1), m: mag[g] });
    }
  }
  let F1 = 0;
  let F2 = 0;
  const cand = peaks.filter((p) => p.f > 250);
  if (cand.length) {
    F1 = cand[0].f;
    const next = cand.find((p) => p.f > F1 + 250);
    F2 = next ? next.f : Math.min(F1 * 2.2, 2800);
  }
  return { rms, f1: F1, f2: F2, voiced };
}

// Kleiner Helfer für die Wiedergabe-Seite: Viseme-Objekt auf 0..1 begrenzen und kopieren.
export function cleanVisemes(source) {
  const out = {};
  for (const key of VISEMES) {
    const v = Number(source?.[key]);
    out[key] = Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0;
  }
  return out;
}
