/**
 * Named blendshape compatibility for GLB facial rigs (ARKit/VRM-like names).
 * Only drives blendshapes that truly exist in the imported asset.
 * Audio energy is not phoneme recognition: vowel motion is an approximation.
 */
const aliases = {
  jaw: ['jawOpen', 'mouthOpen', 'jaw', 'mouth_open'],
  vowelA: ['a', 'aa', 'viseme_aa', 'viseme_a', 'mouthA'],
  vowelI: ['ih', 'ii', 'viseme_ih', 'viseme_i', 'mouthI'],
  vowelU: ['ou', 'uu', 'viseme_ou', 'viseme_u', 'mouthU'],
  blink: ['blink', 'blinkLeft', 'blinkRight', 'eyeBlinkLeft', 'eyeBlinkRight'],
  smile: ['smile', 'mouthSmileLeft', 'mouthSmileRight', 'happy', 'joy'],
  browRaise: ['browInnerUp', 'browOuterUpLeft', 'browOuterUpRight', 'browUp', 'browRaise'],
};
export const normalizeMorphName = (name) => String(name ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
const lookup = new Map(Object.entries(aliases).flatMap(
  ([control, names]) => names.map((name) => [normalizeMorphName(name), control]),
));
export const facialControlNames = Object.freeze(Object.keys(aliases));

export function resolveMorphWeight(name, controlWeights) {
  const control = lookup.get(normalizeMorphName(name));
  if (!control || !Object.prototype.hasOwnProperty.call(controlWeights ?? {}, control)) return undefined;
  const value = Number(controlWeights[control]);
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

export function auditMorphNames(names = []) {
  const available = new Set([...names].map(normalizeMorphName));
  const coverage = Object.fromEntries(Object.entries(aliases).map(([key, values]) =>
    [key, values.some((name) => available.has(normalizeMorphName(name)))]
  ));
  return { coverage, missing: facialControlNames.filter((name) => !coverage[name]) };
}
