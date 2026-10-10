import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('studio avatar handoff importer', () => {
  it('dry-runs a GLB candidate without mutating the manifest', () => {
    const temp = mkdtempSync(join(tmpdir(), 'alice-studio-'));
    const source = join(temp, 'candidate.glb');
    // Valid minimal GLB 2.0: a text signature is not an importable 3D model.
    const doc = { asset: { version: '2.0' }, meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }], accessors: [{ count: 3 }] };
    const json = Buffer.from(JSON.stringify(doc));
    const chunk = Buffer.alloc(Math.ceil(json.length / 4) * 4, 0x20);
    json.copy(chunk);
    const bytes = Buffer.alloc(20 + chunk.length);
    bytes.writeUInt32LE(0x46546c67, 0);
    bytes.writeUInt32LE(2, 4);
    bytes.writeUInt32LE(bytes.length, 8);
    bytes.writeUInt32LE(chunk.length, 12);
    bytes.writeUInt32LE(0x4e4f534a, 16);
    chunk.copy(bytes, 20);
    writeFileSync(source, bytes);

    const before = readFileSync('public/ALICE_CHARACTER_MANIFEST.json', 'utf8');
    const output = execFileSync(
      process.execPath,
      ['tools/import_studio_asset.mjs', '--source', source, '--provenance', 'vitest', '--dry-run'],
      { encoding: 'utf8' }
    );
    const after = readFileSync('public/ALICE_CHARACTER_MANIFEST.json', 'utf8');

    expect(output).toContain('"path": "/alice.glb"');
    expect(output).toContain('"provenance": "vitest"');
    expect(output).toContain('"sha256"');
    expect(output).toContain('"readyForAnimationReview": false');
    expect(after).toBe(before);
  });
});
