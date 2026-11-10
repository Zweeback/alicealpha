// Fail closed when a canonical Alice asset is approved but its actual bytes do not match.
// This check is read-only; it never promotes or rewrites an asset.
import { readFile, realpath } from 'node:fs/promises';
import { resolve, relative, isAbsolute } from 'node:path';
import { verifyApprovedAssetIntegrity, validateAliceCharacterManifest } from '../src/xr/avatarQuality.js';

const root = resolve(import.meta.dirname, '..');
const publicRoot = await realpath(resolve(root, 'public'));
const manifest = JSON.parse(await readFile(resolve(publicRoot, 'ALICE_CHARACTER_MANIFEST.json'), 'utf8'));

if (manifest.canonicalAssetStatus !== 'approved') {
  const validation = validateAliceCharacterManifest(manifest);
  if (!validation.pass) {
    console.error('Alice manifest invalid:', validation.failures.join(', '));
    process.exitCode = 1;
  } else {
    console.log('Alice canonical asset pending: no promotion attempted.');
  }
} else {
  const result = await verifyApprovedAssetIntegrity(manifest, async (assetPath) => {
    if (typeof assetPath !== 'string' || !assetPath.startsWith('/') || assetPath.startsWith('//') || assetPath.includes('\\')) {
      throw new Error('Invalid asset path');
    }
    const target = await realpath(resolve(publicRoot, '.' + assetPath));
    const rel = relative(publicRoot, target);
    if (!rel || rel === '..' || rel.startsWith('../') || isAbsolute(rel)) throw new Error('Asset escapes public root');
    return readFile(target);
  });
  if (!result.canPromote) {
    console.error('Alice canonical integrity gate rejected:', result.failures.join(', '));
    process.exitCode = 1;
  } else {
    console.log('Alice approved asset bytes match recorded SHA-256.');
  }
}
