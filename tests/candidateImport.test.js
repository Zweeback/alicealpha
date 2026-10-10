import { describe, expect, it } from 'vitest';
import { inspectCandidateScene, MAX_CANDIDATE_BYTES, validateCandidateFile, validateGlbHeader } from '../src/xr/candidateImport.js';

const goodHeader = () => {
  const bytes = new ArrayBuffer(24);
  const v = new DataView(bytes);
  v.setUint32(0, 0x46546c67, true);
  v.setUint32(4, 2, true);
  v.setUint32(8, 24, true);
  return bytes;
};

describe('local full-body preview: candidate only', () => {
  it('checks allowed filenames and size limits', () => {
    expect(validateCandidateFile({ name: 'alice.glb', size: 1024 })).toBe(true);
    expect(() => validateCandidateFile({ name: 'portrait.png', size: 1024 })).toThrow(/GLB/);
    expect(() => validateCandidateFile({ name: 'huge.vrm', size: MAX_CANDIDATE_BYTES + 1 })).toThrow(/25 MB/);
  });
  it('rejects forged or truncated GLB headers', () => {
    expect(validateGlbHeader(goodHeader())).toBe(true);
    const fake = goodHeader();
    new DataView(fake).setUint32(8, 20, true);
    expect(() => validateGlbHeader(fake)).toThrow(/Länge/);
    expect(() => validateGlbHeader(new ArrayBuffer(6))).toThrow(/Header/);
  });
  it('counts actual mesh/skin/morph instead of guessing', () => {
    const mock = { scene: { traverse: (fn) => {
      fn({ isBone: true });
      fn({ isMesh: true, isSkinnedMesh: true, geometry: { index: { count: 300 },
        morphAttributes: { position: [{}, {}] } },
        morphTargetDictionary: { jawOpen: 0, blink: 1 },
      });
    } }, animations: [{}] };
    const report = inspectCandidateScene(mock);
    expect(report.triangles).toBe(100);
    expect(report.rigReady).toBe(true);
    expect(report.status).toBe('unapproved_candidate');
    expect(report.expressionNames).toEqual(['blink', 'jawOpen']);
  });
});
