import { describe, expect, it } from 'vitest';
import { evaluateAvatarManifest } from '../src/xr/avatarQuality.js';
import { isExplicit3DSelection, isPortraitSelection, resolveAvatarSelection } from '../src/xr/avatarCatalog.js';

describe('avatar candidate lab', () => {
  it('boots into the live TRELLIS avatar unless portrait fallback is explicitly requested', () => {
    expect(resolveAvatarSelection('?avatar=trellis').id).toBe('trellis');
    expect(resolveAvatarSelection('').id).toBe('trellis');
    expect(isExplicit3DSelection('')).toBe(true);
    expect(isPortraitSelection('')).toBe(false);
    expect(isExplicit3DSelection('?visual=portrait')).toBe(false);
    expect(isPortraitSelection('?visual=portrait')).toBe(true);
  });

  it('keeps unapproved candidates out of approval state', () => {
    const result = evaluateAvatarManifest({
      id: 'alice-test',
      source: { generator: 'test', reference: 'canonical' },
      asset: { path: '/avatars/test.glb' },
      quality: { identity: 'unknown', humanTopology: true, rigged: false, approved: false },
    });

    expect(result.pass).toBe(true);
    expect(result.warnings).toContain('identity-unverified');
    expect(result.warnings).toContain('not-approved');
  });
});
