import { describe, expect, it, vi } from 'vitest';
import { loadCharacterManifest, resolveCharacterAsset } from '../src/core/characterAsset.js';

describe('Alice character asset selection', () => {
  const manifest = {
    identity_revision: 'v2',
    source_reference_set: { id: 'ALICE_SOURCE_REFSET_v2' },
    canonical_asset: {
      status: 'pending',
      format: null,
      path: null,
    },
  };

  it('defaults to procedural while canonical approval is pending', () => {
    expect(resolveCharacterAsset({ manifest, search: '' })).toMatchObject({
      mode: 'procedural',
      canonical: false,
      reason: 'canonical-pending',
      identityRevision: 'v2',
    });
  });

  it('allows explicit GLB/VRM test overrides without calling them canonical', () => {
    expect(resolveCharacterAsset({ manifest, search: '?avatar=glb' })).toMatchObject({
      mode: 'glb',
      path: '/alice.glb',
      canonical: false,
      reason: 'explicit-test-override',
    });
  });

  it('forces procedural mode over an avatar test override', () => {
    expect(resolveCharacterAsset({ manifest, search: '?avatar=vrm&procedural=1' })).toMatchObject({
      mode: 'procedural',
      reason: 'forced-procedural',
    });
  });

  it('selects only an explicitly approved canonical asset by default', () => {
    const approved = {
      ...manifest,
      canonical_asset: {
        status: 'canonical',
        format: 'vrm',
        path: '/alice_v2.vrm',
      },
    };
    expect(resolveCharacterAsset({ manifest: approved, search: '' })).toMatchObject({
      mode: 'vrm',
      path: '/alice_v2.vrm',
      canonical: true,
      reason: 'canonical-approved',
    });
  });

  it('fails safely when the manifest cannot be loaded', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('offline'));
    expect(await loadCharacterManifest(fetchImpl)).toBeNull();
    expect(resolveCharacterAsset({ manifest: null })).toMatchObject({
      mode: 'procedural',
      reason: 'manifest-unavailable',
    });
  });
});
