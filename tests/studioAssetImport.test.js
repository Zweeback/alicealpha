import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('studio avatar handoff importer', () => {
  it('dry-runs a GLB candidate without mutating the manifest', () => {
    const temp = mkdtempSync(join(tmpdir(), 'alice-studio-'));
    const source = join(temp, 'candidate.glb');
    writeFileSync(source, Buffer.from('glTF-test-candidate'));

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
    expect(after).toBe(before);
  });
});
