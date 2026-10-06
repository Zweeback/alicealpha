import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

import { inspectAvatarCandidate } from '../src/xr/AliceWorld.js';
import { AVATAR_CATALOG, resolveAvatarSelection } from '../src/xr/avatarCatalog.js';

globalThis.self = globalThis;

function loadGlb(path) {
  const bytes = fs.readFileSync(path);
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  return new Promise((resolve, reject) => loader.parse(buffer, '', resolve, reject));
}

describe('registered rigged Alice candidate', () => {
  it('keeps the candidate explicit and never changes the safe default', () => {
    expect(resolveAvatarSelection('').id).toBe('procedural');
    expect(resolveAvatarSelection('?avatar=rigged').id).toBe('rigged');
    expect(AVATAR_CATALOG.rigged.status).toBe('candidate');
    expect(AVATAR_CATALOG.rigged.provenance.approved).toBe(false);
  });

  it('matches the manifest and deterministic conversion evidence', () => {
    const bytes = fs.readFileSync('public/avatars/alice-rigged.glb');
    const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
    const manifest = JSON.parse(fs.readFileSync('public/ALICE_CHARACTER_MANIFEST.json', 'utf8'));
    const evidence = JSON.parse(fs.readFileSync('public/avatars/alice-rigged.json', 'utf8'));
    const candidate = manifest.candidateAssets.find((item) => item.path === '/avatars/alice-rigged.glb');

    expect(sha256).toBe('a2c599215b80fc2bef8f1ff8d16378d0b47755b61cc680e013d8af0b0825bd46');
    expect(candidate.sha256).toBe(sha256);
    expect(evidence.output.sha256).toBe(sha256);
    expect(evidence.approved).toBe(false);
    expect(evidence.limitations).toContain('identity-not-visually-approved');
  });

  it('loads as a genuinely rigged, face-controllable GLB', async () => {
    const gltf = await loadGlb('public/avatars/alice-rigged.glb');
    const diagnostics = inspectAvatarCandidate(gltf);
    const boneNames = diagnostics.bones.map((name) => name.toLowerCase());

    expect(diagnostics.rigged).toBe(true);
    expect(diagnostics.skinnedMeshes).toBe(8);
    expect(diagnostics.boneCount).toBeGreaterThanOrEqual(70);
    expect(boneNames).toContain('head');
    expect(boneNames).toContain('lefteye');
    expect(boneNames).toContain('rightarm');
    expect(diagnostics.morphTargets).toEqual(expect.arrayContaining([
      'eyeBlinkLeft', 'eyeBlinkRight', 'jawOpen', 'mouthSmileLeft', 'aa', 'ih', 'oh', 'ou',
    ]));
  });

  it('rebuilds byte-for-byte from the registered FBX source', () => {
    const temp = mkdtempSync(join(tmpdir(), 'alice-rigged-'));
    const output = join(temp, 'alice-rigged.glb');
    execFileSync(
      process.execPath,
      ['tools/convert_fbx_candidate.mjs', 'public/avatars/candidates/model.fbx', output],
      { stdio: 'ignore' },
    );
    const generated = crypto.createHash('sha256').update(fs.readFileSync(output)).digest('hex');
    const committed = crypto.createHash('sha256').update(fs.readFileSync('public/avatars/alice-rigged.glb')).digest('hex');
    expect(generated).toBe(committed);
  });
});
