import fs from 'node:fs';
import crypto from 'node:crypto';
import { describe, expect, it } from 'vitest';

const FBX_PATH = 'public/avatars/candidates/model.fbx';
const EXPECTED_SHA256 = 'da4e5c3bc65b21bdbf9c73c2651df81a645bb315d747c2d9383aa0da025e4c59';

describe('Alice FBX source candidate integrity', () => {
  it('keeps the exact registered binary candidate and manifest provenance in sync', () => {
    const bytes = fs.readFileSync(FBX_PATH);
    const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
    const manifest = JSON.parse(fs.readFileSync('public/ALICE_CHARACTER_MANIFEST.json', 'utf8'));
    const candidate = manifest.candidateAssets.find((item) => item.path === '/avatars/candidates/model.fbx');

    expect(bytes.length).toBe(7_116_336);
    expect(sha256).toBe(EXPECTED_SHA256);
    expect(candidate).toBeTruthy();
    expect(candidate.kind).toBe('fbx');
    expect(candidate.status).toBe('candidate');
    expect(candidate.sha256).toBe(EXPECTED_SHA256);
    expect(manifest.approvedAsset).toBeNull();
    expect(manifest.canonicalAssetStatus).toBe('pending');
  });
});
