import { describe, expect, it } from 'vitest';
import { evaluateAvatarManifest } from '../src/xr/avatarQuality.js';
import { buildAvatarViewSearch, isExplicit3DSelection, isPortraitSelection, resolveAvatarSelection, selectedAvatarView, shouldShowPortrait } from '../src/xr/avatarCatalog.js';

describe('avatar candidate lab', () => {
  it('keeps TRELLIS explicit while defaulting to the approved-safe procedural avatar', () => {
    expect(resolveAvatarSelection('?avatar=trellis').id).toBe('trellis');
    expect(resolveAvatarSelection('').id).toBe('procedural');
    expect(isExplicit3DSelection('')).toBe(false);
    expect(isPortraitSelection('')).toBe(false);
    expect(isExplicit3DSelection('?visual=portrait')).toBe(false);
    expect(isExplicit3DSelection('?visual=3d')).toBe(true);
    expect(isExplicit3DSelection('?avatar=trellis')).toBe(true);
    expect(isPortraitSelection('?visual=portrait')).toBe(true);
    expect(isExplicit3DSelection('?procedural=1')).toBe(true);
  });

  it('uses the approved identity portrait by default until a faithful 3D asset is accepted', () => {
    expect(shouldShowPortrait('')).toBe(true);
    expect(shouldShowPortrait('?procedural=1')).toBe(false);
    expect(shouldShowPortrait('?avatar=glb')).toBe(false);
    expect(shouldShowPortrait('?visual=portrait')).toBe(true);
    expect(shouldShowPortrait('', { renderFallback: true })).toBe(true);
    expect(shouldShowPortrait('?visual=portrait', { sessionMode: 'ar' })).toBe(false);
  });

  it('selects modes independently and preserves call or demo state', () => {
    expect(selectedAvatarView('')).toBe('procedural');
    expect(selectedAvatarView('?visual=portrait')).toBe('portrait');
    expect(selectedAvatarView('?avatar=trellis')).toBe('trellis');
    expect(buildAvatarViewSearch('?call=1&avatar=trellis', 'portrait')).toBe('?call=1&visual=portrait');
    expect(buildAvatarViewSearch('?demo=1&visual=portrait', 'trellis')).toBe('?demo=1&visual=3d&avatar=trellis');
    expect(buildAvatarViewSearch('?avatar=trellis', 'procedural')).toBe('?visual=3d');
    expect(resolveAvatarSelection(buildAvatarViewSearch('', 'trellis')).status).toBe('candidate');
    expect(shouldShowPortrait('?avatar=trellis')).toBe(false);
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
