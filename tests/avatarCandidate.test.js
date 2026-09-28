import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { evaluateAvatarManifest } from '../src/xr/avatarQuality.js';
import { isExplicit3DSelection, isPortraitSelection, resolveAvatarSelection, shouldShowPortrait } from '../src/xr/avatarCatalog.js';

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
  });

  it('boots into live 3D procedural Alice without query', () => {
    expect(shouldShowPortrait('')).toBe(false);
    expect(shouldShowPortrait('?procedural=1')).toBe(false);
    expect(isExplicit3DSelection('?procedural=1')).toBe(true);
    expect(shouldShowPortrait('?visual=portrait')).toBe(true);
    expect(shouldShowPortrait('?visual=portrait', { portraitFailed: true })).toBe(false);
    expect(shouldShowPortrait('', { renderFallback: true })).toBe(true);
  });

  it('validates canonical portrait asset is decodable JPEG with non-zero dimensions', () => {
    const buf = fs.readFileSync('public/alice-canonical.jpg');
    expect(buf.length).toBeGreaterThan(0);
    let w = 0;
    let h = 0;
    for (let i = 0; i < buf.length - 8; i++) {
      if (buf[i] === 0xff && (buf[i + 1] === 0xc0 || buf[i + 1] === 0xc2)) {
        h = buf.readUInt16BE(i + 5);
        w = buf.readUInt16BE(i + 7);
        break;
      }
    }
    expect(w).toBeGreaterThan(0);
    expect(h).toBeGreaterThan(0);
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
