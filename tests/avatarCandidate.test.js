import { describe, expect, it } from 'vitest';
import { evaluateAvatarManifest } from '../src/xr/avatarQuality.js';
import { isExplicit3DSelection, resolveAvatarSelection } from '../src/xr/avatarCatalog.js';

describe('avatar candidate lab', () => {
  it('resolves TRELLIS only when explicitly requested', () => {
    expect(resolveAvatarSelection('?avatar=trellis').id).toBe('trellis');
    expect(resolveAvatarSelection('').id).toBe('procedural');
    expect(isExplicit3DSelection('?avatar=trellis')).toBe(true);
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
