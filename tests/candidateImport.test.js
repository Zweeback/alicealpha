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
      const bone = { isBone: true };
      fn(bone);
      fn({ isMesh: true, isSkinnedMesh: true, morphTargetDictionary: { jawOpen: 0, blink: 1 },
        skeleton: { bones: [bone] },
        geometry: {
          index: { count: 300 },
          attributes: {
            position: { count: 100 }, skinIndex: { count: 100 }, skinWeight: { count: 100 }
          },
          morphAttributes: { position: [{}, {}] },
        },
      });
    } }, animations: [{}] };
    const report = inspectCandidateScene(mock);
    expect(report.triangles).toBe(100);
    expect(report.rigReady).toBe(true);
    expect(report.status).toBe('unapproved_candidate');
    expect(report.expressionNames).toEqual(['blink', 'jawOpen']);
    expect(report.boundSkinMeshes).toBe(1);
    expect(report.linkedBones).toBe(1);
    expect(report.facialControls.jaw).toBe(true);
    expect(report.missingFacialControls).toContain('vowelU');
  });
  it('does not mistake unrelated bones or an unbound SkinnedMesh for working rigging', () => {
    const fake = { scene: { traverse: (fn) => {
      fn({ isBone: true });
      fn({ isMesh: true, isSkinnedMesh: true, geometry: {
        attributes: { position: { count: 3 }, skinIndex: { count: 3 }, skinWeight: { count: 3 } }
      } });
    } } };
    const report = inspectCandidateScene(fake);
    expect(report.skinned).toBe(1);
    expect(report.bones).toBe(1);
    expect(report.boundSkinMeshes).toBe(0);
    expect(report.rigReady).toBe(false);
    expect(report.status).toBe('unapproved_candidate');
  });
  it('rejects a skeleton if the skin binding channels have mismatched vertex counts', () => {
    const fake = { scene: { traverse: (fn) => fn({
      isMesh: true, isSkinnedMesh: true,
      skeleton: { bones: [{ isBone: true }] },
      geometry: { attributes: {
        position: { count: 10 }, skinIndex: { count: 10 }, skinWeight: { count: 9 }
      } }
    }) } };
    expect(inspectCandidateScene(fake).rigReady).toBe(false);
  });
});
