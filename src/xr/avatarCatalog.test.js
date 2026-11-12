import { describe, expect, it } from 'vitest';
import { AVATAR_CATALOG, resolveAvatarSelection, shouldShowPortrait } from './avatarCatalog.js';

describe('avatar URL selection is restricted to registered own keys', () => {
  it('accepts explicit registered 3D candidates without granting canonical approval', () => {
    expect(resolveAvatarSelection('?avatar=fbxsource')).toBe(AVATAR_CATALOG.fbxsource);
    expect(resolveAvatarSelection('?avatar=fbxsource').status).toBe('candidate');
    expect(shouldShowPortrait('?avatar=fbxsource')).toBe(false);
  });

  it.each(['__proto__', 'constructor', 'toString', 'hasOwnProperty', 'unknown'])(
    'falls back for unregistered or inherited key %s', (key) => {
      const selected = resolveAvatarSelection('?avatar=' + encodeURIComponent(key));
      expect(selected).toBe(AVATAR_CATALOG.procedural);
      expect(selected.kind).toBe('procedural');
    },
  );

  it('keeps the portrait default unchanged', () => {
    expect(resolveAvatarSelection('')).toBe(AVATAR_CATALOG.procedural);
    expect(shouldShowPortrait('')).toBe(true);
  });
});
