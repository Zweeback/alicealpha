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

// The approved reference is selectable, but must not hide the live renderer.
export function shouldShowPortrait(search = '', { sessionMode = 'desktop', renderFallback = false } = {}) {
  if (sessionMode !== 'desktop') return false;
  if (renderFallback) return true;
  return isPortraitSelection(search);
}

export function selectedAvatarView(search = '') {
  if (isPortraitSelection(search)) return 'portrait';
  return resolveAvatarSelection(search).id === 'trellis' ? 'trellis' : 'procedural';
}

// Separate the portrait, verified procedural body and unapproved TRELLIS test.
export function buildAvatarViewSearch(search = '', view = 'procedural') {
  const params = new URLSearchParams(search);
  params.delete('visual');
  params.delete('avatar');
  params.delete('procedural');
  if (view === 'portrait') {
    params.set('visual', 'portrait');
  } else if (view === 'trellis') {
    params.set('visual', '3d');
    params.set('avatar', 'trellis');
  } else {
    params.set('visual', '3d');
  }
  return `?${params.toString()}`;
}
