export const AVATAR_CATALOG = Object.freeze({
  procedural: Object.freeze({
    id: 'procedural',
    kind: 'procedural',
    status: 'fallback',
    label: 'Procedural fallback',
  }),
  glb: Object.freeze({
    id: 'glb',
    kind: 'glb',
    status: 'legacy',
    label: 'Legacy GLB',
    url: '/alice.glb',
  }),
  vrm: Object.freeze({
    id: 'vrm',
    kind: 'vrm',
    status: 'candidate',
    label: 'VRM candidate',
    url: '/alice.vrm',
  }),
  trellis: Object.freeze({
    id: 'trellis',
    kind: 'glb',
    status: 'candidate',
    label: 'TRELLIS Alice candidate',
    url: '/avatars/alice-trellis.glb',
    provenance: Object.freeze({
      source: 'canonical-grok-reference',
      generator: 'trellis-community/TRELLIS',
      workflowRun: '35642208693',
      artifactId: '10671300146',
      approved: false,
    }),
  }),
  rigged: Object.freeze({
    id: 'rigged',
    kind: 'glb',
    status: 'candidate',
    label: 'Rigged Alice candidate',
    url: '/avatars/alice-rigged.glb',
    provenance: Object.freeze({
      source: '/avatars/candidates/model.fbx',
      sourceSha256: 'da4e5c3bc65b21bdbf9c73c2651df81a645bb315d747c2d9383aa0da025e4c59',
      outputSha256: 'a2c599215b80fc2bef8f1ff8d16378d0b47755b61cc680e013d8af0b0825bd46',
      approved: false,
    }),
  }),
});

export function resolveAvatarSelection(search = '') {
  const params = new URLSearchParams(search);
  const requested = params.get('avatar') || 'procedural';
  return AVATAR_CATALOG[requested] || AVATAR_CATALOG.procedural;
}

export function isExplicit3DSelection(search = '') {
  const params = new URLSearchParams(search);
  return params.get('visual') === '3d'
    || Boolean(params.get('avatar'))
    || params.get('procedural') === '1';
}

export function isPortraitSelection(search = '') {
  return new URLSearchParams(search).get('visual') === 'portrait';
}


export function shouldShowPortrait(search = '', { sessionMode = 'desktop', renderFallback = false } = {}) {
  if (sessionMode !== 'desktop') return false;
  if (renderFallback) return true;
  return isPortraitSelection(search);
}
