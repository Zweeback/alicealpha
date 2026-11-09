import { describe, expect, it } from 'vitest';
import { AVATAR_CATALOG, resolveAvatarSelection, shouldShowPortrait } from '../src/xr/avatarCatalog.js';

// Regression gate for the code-only owner VRM handoff. No private VRM bytes
// or owner approval are required to run these deterministic checks.
describe('owner VRM version selectors (unapproved candidates)', () => {
  const versions = {
    v04: '/avatars/Alice_v0.4.vrm',
    v05: '/avatars/Alice_v0.5.vrm',
    v05mobile: '/avatars/Alice_v0.5_pc70k.vrm',
    v06: '/avatars/alice_v0.6.vrm',
  };

  it.each(Object.entries(versions))('%s resolves to the expected candidate path', (id, url) => {
    const selected = resolveAvatarSelection('?avatar=' + id + '&visual=3d');
    expect(selected).toBe(AVATAR_CATALOG[id]);
    expect(selected).toMatchObject({ id, url, kind: 'vrm', status: 'candidate' });
    expect(selected.provenance?.approved).not.toBe(true);
    expect(shouldShowPortrait('?avatar=' + id + '&visual=3d')).toBe(false);
  });

  it('does not silently select a candidate as the default avatar', () => {
    expect(resolveAvatarSelection('')).toBe(AVATAR_CATALOG.procedural);
    expect(shouldShowPortrait('')).toBe(true);
    expect(resolveAvatarSelection('?avatar=unrecognized')).toBe(AVATAR_CATALOG.procedural);
  });

  it('preserves the explicit procedural fallback', () => {
    expect(resolveAvatarSelection('?avatar=procedural&visual=3d')).toBe(AVATAR_CATALOG.procedural);
    expect(shouldShowPortrait('?procedural=1')).toBe(false);
  });
});
