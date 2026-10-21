import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createBroadcastSet } from './BroadcastSet.js';

function fakeCanvas() {
  const context = {
    createLinearGradient: () => ({ addColorStop() {} }),
    beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, ellipse() {},
    fillRect() {}, fillText() {}, measureText(t) { return { width: String(t).length * 20 }; },
    set fillStyle(value) { this._fillStyle = value; }, get fillStyle() { return this._fillStyle; },
    set strokeStyle(value) { this._strokeStyle = value; },
    set lineWidth(value) { this._lineWidth = value; },
    set font(value) { this._font = value; },
    set letterSpacing(value) { this._letterSpacing = value; },
  };
  return { width: 0, height: 0, getContext: () => context };
}

describe('Three.js broadcast studio', () => {
  beforeEach(() => vi.stubGlobal('document', { createElement: () => fakeCanvas() }));
  afterEach(() => vi.unstubAllGlobals());

  it('constructs real 3D cameras, anchor desk, stage and LED panels', () => {
    const set = createBroadcastSet();
    expect(set.root).toBeInstanceOf(THREE.Group);
    const names = new Set();
    set.root.traverse((node) => names.add(node.name));
    for (const name of [
      'round-stage', 'anchor-desk-top', 'anchor-desk-body', 'main-led-wall',
      'left-info-wall', 'right-story-wall', 'camera-two', 'camera-three',
      'tally-sign',
    ]) expect(names.has(name)).toBe(true);
    set.dispose();
  });

  it('updates broadcast state and headline without modifying global state', () => {
    const set = createBroadcastSet();
    set.setOnAir(true);
    expect(set.state.onAir).toBe(true);
    const screen = set.root.getObjectByName('right-story-wall-screen');
    const oldMap = screen.material.map;
    set.setHeadline('Neue Meldung');
    expect(set.state.headline).toBe('Neue Meldung');
    expect(screen.material.map).not.toBe(oldMap);
    set.setOnAir(false);
    expect(set.state.onAir).toBe(false);
    set.dispose();
  });

  it('clamps the display title and disposes geometries/textures safely', () => {
    const set = createBroadcastSet();
    set.setHeadline('N'.repeat(350));
    expect(set.state.headline).toHaveLength(160);
    expect(() => set.dispose()).not.toThrow();
  });
});
