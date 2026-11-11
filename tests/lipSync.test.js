import { describe, expect, it } from 'vitest';
import { LipSync, analyzeFrame, cleanVisemes, VISEMES } from '../src/core/lipSync.js';

const SR = 48000;

// Synthetischer Vokal: Impulszug (Grundton f0) durch zwei/drei Zweipol-Resonatoren bei F1, F2, F3.
function vowel(f1, f2, { f0 = 210, seconds = 0.032, amp = 0.3, f3 = 3300 } = {}) {
  const n = Math.round(SR * seconds);
  const src = new Float32Array(n);
  const period = Math.round(SR / f0);
  for (let i = 0; i < n; i += period) src[i] = 1;
  let x = src;
  for (const [fc, bw] of [[f1, 90], [f2, 120], [f3, 200]]) {
    const rr = Math.exp((-Math.PI * bw) / SR);
    const th = (2 * Math.PI * fc) / SR;
    const a1 = -2 * rr * Math.cos(th);
    const a2 = rr * rr;
    const y = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      y[i] = x[i] - a1 * (i > 0 ? y[i - 1] : 0) - a2 * (i > 1 ? y[i - 2] : 0);
    }
    x = y;
  }
  let peak = 0;
  for (const v of x) peak = Math.max(peak, Math.abs(v));
  return x.map((v) => (v / (peak || 1)) * amp);
}

function noise(seconds = 0.032, amp = 0.1) {
  const n = Math.round(SR * seconds);
  const out = new Float32Array(n);
  let seed = 7;
  for (let i = 0; i < n; i++) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    out[i] = ((seed / 4294967296) * 2 - 1) * amp;
  }
  return out;
}

function run(lip, frame, frames = 30) {
  for (let i = 0; i < frames; i++) lip.update(frame, SR, 0.016);
  return { ...lip.out };
}

const dominant = (out) => Object.entries(out).sort((a, b) => b[1] - a[1])[0][0];

describe('LipSync', () => {
  it('bleibt bei Stille geschlossen', () => {
    const lip = new LipSync();
    const out = run(lip, new Float32Array(1536));
    for (const k of VISEMES) expect(out[k]).toBeLessThan(0.01);
  });

  it('erkennt ein offenes /a/ und öffnet den Mund deutlich', () => {
    const out = run(new LipSync(), vowel(850, 1250));
    expect(dominant(out)).toBe('aa');
    expect(out.aa).toBeGreaterThan(0.3);
  });

  it('unterscheidet /i/ (hohes F2) von /a/', () => {
    const i = run(new LipSync(), vowel(360, 2650));
    const a = run(new LipSync(), vowel(850, 1250));
    expect(i.aa).toBeLessThan(a.aa);
    expect(['ih', 'ee']).toContain(dominant(i));
  });

  it('liefert für /e/ mehr ee als für /a/', () => {
    const e = run(new LipSync(), vowel(580, 2350));
    const a = run(new LipSync(), vowel(850, 1250));
    expect(e.ee).toBeGreaterThan(a.ee);
  });

  it('klassifiziert Rauschen als nicht stimmhaft und hält den Mund klein', () => {
    const { voiced } = analyzeFrame(noise(), SR);
    expect(voiced).toBe(false);
    const out = run(new LipSync(), noise());
    expect(out.aa).toBeLessThan(0.3);
  });

  it('schließt den Mund wieder, wenn das Signal endet', () => {
    const lip = new LipSync();
    run(lip, vowel(850, 1250));
    expect(lip.out.aa).toBeGreaterThan(0.2);
    for (let i = 0; i < 60; i++) lip.update(new Float32Array(1536), SR, 0.016);
    expect(lip.out.aa).toBeLessThan(0.02);
  });

  it('übersteht leere oder ungültige Frames ohne Fehler', () => {
    const lip = new LipSync();
    expect(() => lip.update(null, SR, 0.016)).not.toThrow();
    expect(() => lip.update(new Float32Array(0), SR, 0.016)).not.toThrow();
    expect(() => lip.update(new Float32Array(1536), 0, 0.016)).not.toThrow();
    for (const k of VISEMES) expect(Number.isFinite(lip.out[k])).toBe(true);
  });

  it('funktioniert bei 16 kHz und 44,1 kHz', () => {
    for (const sr of [16000, 44100]) {
      const lip = new LipSync();
      const n = Math.round(sr * 0.032);
      const frame = new Float32Array(n);
      for (let i = 0; i < n; i++) frame[i] = 0.25 * Math.sin((2 * Math.PI * 700 * i) / sr);
      for (let i = 0; i < 20; i++) lip.update(frame, sr, 0.016);
      for (const k of VISEMES) expect(Number.isFinite(lip.out[k])).toBe(true);
    }
  });
});

describe('cleanVisemes', () => {
  it('begrenzt auf 0..1 und ersetzt fehlende Werte', () => {
    expect(cleanVisemes({ aa: 4, ih: -1, ou: 'x' })).toEqual({ aa: 1, ih: 0, ou: 0, ee: 0, oh: 0 });
    expect(cleanVisemes(null)).toEqual({ aa: 0, ih: 0, ou: 0, ee: 0, oh: 0 });
  });
});
