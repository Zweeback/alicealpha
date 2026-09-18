export async function loadCharacterManifest(fetchImpl = globalThis.fetch) {
  if (typeof fetchImpl !== 'function') return null;
  try {
    const response = await fetchImpl('/ALICE_CHARACTER_MANIFEST.json', { cache: 'no-store' });
    if (!response?.ok) return null;
    const manifest = await response.json();
    return manifest && typeof manifest === 'object' ? manifest : null;
  } catch {
    return null;
  }
}

export function resolveCharacterAsset({ manifest, search = '' } = {}) {
  const params = new URLSearchParams(search);
  const requested = params.get('avatar');
  const forceProcedural = params.get('procedural') === '1';

  const identityRevision = manifest?.identity_revision ?? null;
  const sourceReferenceSet = manifest?.source_reference_set?.id ?? null;

  if (forceProcedural) {
    return {
      mode: 'procedural',
      path: null,
      canonical: false,
      reason: 'forced-procedural',
      identityRevision,
      sourceReferenceSet,
    };
  }

  if (requested === 'glb' || requested === 'vrm') {
    return {
      mode: requested,
      path: requested === 'vrm' ? '/alice.vrm' : '/alice.glb',
      canonical: false,
      reason: 'explicit-test-override',
      identityRevision,
      sourceReferenceSet,
    };
  }

  const asset = manifest?.canonical_asset;
  if (asset?.status === 'canonical' && ['glb', 'vrm'].includes(asset.format) && asset.path) {
    return {
      mode: asset.format,
      path: asset.path,
      canonical: true,
      reason: 'canonical-approved',
      identityRevision,
      sourceReferenceSet,
    };
  }

  return {
    mode: 'procedural',
    path: null,
    canonical: false,
    reason: manifest ? 'canonical-pending' : 'manifest-unavailable',
    identityRevision,
    sourceReferenceSet,
  };
}
