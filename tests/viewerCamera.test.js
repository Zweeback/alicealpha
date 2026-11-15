import { describe, expect, it } from 'vitest';
import { cameraViewVector } from '../src/viewer/cameraDirections.js';

describe('ALICE viewer camera directions', () => {
  it('looks toward the face of VRM 1.0 characters along the -Z forward axis', () => {
    expect(cameraViewVector('front', { isVrm: true })).toEqual([0, 0, -1]);
    expect(cameraViewVector('back', { isVrm: true })).toEqual([0, 0, 1]);
  });

  it('preserves existing source GLB camera orientation', () => {
    expect(cameraViewVector('front', { isVrm: false })).toEqual([0, 0, 1]);
    expect(cameraViewVector('back', { isVrm: false })).toEqual([0, 0, -1]);
  });

  it('keeps the side camera and unknown direction deterministic', () => {
    expect(cameraViewVector('side', { isVrm: true })).toEqual([1, 0, 0]);
    expect(cameraViewVector('side', { isVrm: false })).toEqual([1, 0, 0]);
    expect(cameraViewVector('unexpected', { isVrm: true })).toEqual([0, 0, -1]);
  });
});
