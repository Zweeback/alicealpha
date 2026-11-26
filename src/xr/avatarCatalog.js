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
    // Standardansicht auf Anweisung des Besitzers (2026-11-26). Das Freigabe-Gate im Manifest bleibt davon unberührt.
    status: 'default',
    label: 'Alice v0.5 (VRM)',
    url: '/alice.vrm',
  }),
  fbxsource: Object.freeze({
    id: 'fbxsource',
    kind: 'glb',
    status: 'candidate',
    label: 'Original rigged FBX avatar (preview only)',
    url: '/avatars/alice-fbx-source.glb',
    provenance: Object.freeze({
      source: 'public/avatars/candidates/model.fbx',
      converter: 'Blender 4.0.2',
      verifiedArmatureBones: 73,
      verifiedWeightedMeshes: 8,
      approved: false,
    }),
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
  const requested = params.get('avatar') || 'vrm';
  return AVATAR_CATALOG[requested] || AVATAR_CATALOG.vrm;
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
  // Das 3D-Modell ist die Standardansicht. Das Porträt erscheint nur auf Wunsch (?visual=portrait),
  // als Rückfall ohne WebGL oder bei Ladefehler und als Platzhalter, bis das Modell geladen ist.
  return isPortraitSelection(search);
}
