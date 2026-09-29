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
  newsGlb: Object.freeze({
    id: 'news-glb',
    kind: 'glb',
    status: 'candidate',
    label: 'News anchor GLB',
    url: '/alice-news.glb',
  }),
  newsVrm: Object.freeze({
    id: 'news-vrm',
    kind: 'vrm',
    status: 'candidate',
    label: 'News anchor VRM',
    url: '/alice-news.vrm',
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
  return params.get('visual') === '3d' || Boolean(params.get('avatar'));
}

export function isPortraitSelection(search = '') {
  return new URLSearchParams(search).get('visual') === 'portrait';
}
