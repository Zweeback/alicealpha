import { describe, expect, it, vi } from 'vitest';
import { createLazyWorld } from '../src/xr/lazyWorld.js';

function fakeLoader({ failConstruct = false, failInit = false } = {}) {
  const calls = [];
  class FakeWorld {
    constructor(canvas, options) {
      if (failConstruct) throw new Error('webgl-unavailable');
      this.canvas = canvas;
      this.options = options;
      calls.push('construct');
    }
    async init() { if (failInit) throw new Error('init-failed'); calls.push('init'); }
    setPresence(p) { calls.push(['presence', p]); }
    setRepresentation(m) { calls.push(['representation', m]); return m; }
    setSpeechEnergy(v) { calls.push(['energy', v]); }
    setVisemes(v, vol) { calls.push(['visemes', v, vol]); }
    async support() { return { ar: true, vr: false }; }
    async startXR(mode) { calls.push(['xr', mode]); return 'session'; }
    async loadCandidateFile() { return { meshes: 1 }; }
    dispose() { calls.push('dispose'); }
  }
  return { calls, load: async () => ({ AliceWorld: FakeWorld }) };
}

describe('createLazyWorld', () => {
  it('verwirft Aufrufe vor dem Laden, merkt aber Präsenz und Darstellungsmodus', async () => {
    const { calls, load } = fakeLoader();
    const world = createLazyWorld({}, {}, { load });
    world.setSpeechEnergy(0.5);
    world.setPresence({ present: true, x: 0.2 });
    world.setRepresentation('whisper');
    await world.ready;
    expect(calls).not.toContainEqual(['energy', 0.5]);
    expect(calls).toContainEqual(['presence', { present: true, x: 0.2 }]);
    expect(calls).toContainEqual(['representation', 'whisper']);
    expect(world.loaded).toBe(true);
    world.setSpeechEnergy(0.7);
    expect(calls).toContainEqual(['energy', 0.7]);
  });

  it('erstellt nach dispose vor dem Laden keine Welt', async () => {
    const { calls, load } = fakeLoader();
    const world = createLazyWorld({}, {}, { load });
    world.dispose();
    await world.ready;
    expect(calls).not.toContain('construct');
    expect(world.loaded).toBe(false);
  });

  it('meldet WebGL-Fehler über ready und bleibt danach harmlos', async () => {
    const { load } = fakeLoader({ failConstruct: true });
    const world = createLazyWorld({}, {}, { load });
    await expect(world.ready).rejects.toThrow('webgl-unavailable');
    expect(() => world.setSpeechEnergy(1)).not.toThrow();
    expect(() => world.playCue({})).not.toThrow();
    expect(await world.support()).toEqual({ ar: false, vr: false });
    await expect(world.startXR('ar')).rejects.toThrow();
    await expect(world.loadCandidateFile({})).rejects.toThrow('3D-Viewer ist nicht verfügbar.');
  });

  it('meldet Init-Fehler über ready', async () => {
    const { load } = fakeLoader({ failInit: true });
    const world = createLazyWorld({}, {}, { load });
    await expect(world.ready).rejects.toThrow('init-failed');
  });

  it('reicht support, startXR und loadCandidateFile an die echte Welt weiter', async () => {
    const { calls, load } = fakeLoader();
    const world = createLazyWorld({}, {}, { load });
    expect(await world.support()).toEqual({ ar: true, vr: false });
    expect(await world.startXR('vr')).toBe('session');
    expect(calls).toContainEqual(['xr', 'vr']);
    expect(await world.loadCandidateFile({})).toEqual({ meshes: 1 });
  });

  it('lädt das Modul nur einmal und gibt Ressourcen mit dispose frei', async () => {
    const { calls, load } = fakeLoader();
    const spy = vi.fn(load);
    const world = createLazyWorld({}, {}, { load: spy });
    await world.ready;
    world.dispose();
    expect(spy).toHaveBeenCalledTimes(1);
    expect(calls).toContain('dispose');
    world.setSpeechEnergy(1);
    expect(calls.filter((c) => Array.isArray(c) && c[0] === 'energy')).toHaveLength(0);
  });
});
