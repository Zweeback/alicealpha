import { describe, expect, it } from 'vitest';
import { validateManifest } from '../scripts/validate-character-manifest.mjs';

function baseManifest() {
  return {
    schema_version: '1.0.0',
    character_id: 'alice',
    identity_revision: 'v2',
    source_reference_set: {
      id: 'ALICE_SOURCE_REFSET_v2',
      authority: 'original-grok-video-frames',
    },
    canonical_asset: {
      status: 'pending',
      format: null,
      path: null,
      sha256: null,
      approved_at: null,
    },
    rig_contract: {
      required_humanoid_bones: [
        'hips','spine','chest','neck','head',
        'leftUpperArm','leftLowerArm','leftHand',
        'rightUpperArm','rightLowerArm','rightHand',
        'leftUpperLeg','leftLowerLeg','leftFoot',
        'rightUpperLeg','rightLowerLeg','rightFoot',
      ],
    },
    face_contract: {
      required_expressions: ['blink','jawOpen','smile'],
      required_visemes: ['A','I','U','E','O'],
    },
    fallback_policy: {
      mode: 'procedural',
      silent_identity_substitution: false,
    },
  };
}

describe('Alice character manifest contract', () => {
  it('accepts a valid pending manifest', () => {
    expect(validateManifest(baseManifest())).toEqual({ ok: true, errors: [] });
  });

  it('rejects missing identity source fields', () => {
    const manifest = baseManifest();
    delete manifest.source_reference_set.id;
    expect(validateManifest(manifest).ok).toBe(false);
  });

  it('rejects a candidate that tries to occupy canonical fields', () => {
    const manifest = baseManifest();
    manifest.canonical_asset.status = 'candidate';
    manifest.canonical_asset.path = '/alice_v2.glb';
    expect(validateManifest(manifest).ok).toBe(false);
  });

  it('accepts an explicitly approved canonical asset', () => {
    const manifest = baseManifest();
    manifest.canonical_asset = {
      status: 'canonical',
      format: 'vrm',
      path: '/alice_v2.vrm',
      sha256: 'a'.repeat(64),
      approved_at: '2026-09-18T00:00:00Z',
    };
    expect(validateManifest(manifest)).toEqual({ ok: true, errors: [] });
  });

  it('requires the procedural fallback and forbids silent identity substitution', () => {
    const manifest = baseManifest();
    manifest.fallback_policy.silent_identity_substitution = true;
    expect(validateManifest(manifest).ok).toBe(false);
  });
});
