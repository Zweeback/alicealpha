const VISEMES = Object.freeze(['A', 'I', 'U', 'E', 'O']);

const ALIASES = Object.freeze({
  A: new Set(['a', 'aa', 'visemea', 'visemeaa', 'moutha', 'mouthaa', 'jawopen', 'mouthopen']),
  I: new Set(['i', 'ih', 'visemei', 'visemeih', 'mouthi', 'mouthih']),
  U: new Set(['u', 'ou', 'visemeu', 'visemeou', 'mouthu', 'mouthou']),
  E: new Set(['e', 'ee', 'visemee', 'visemeee', 'mouthe', 'mouthee']),
  O: new Set(['o', 'oh', 'visemeo', 'visemeoh', 'moutho', 'mouthoh']),
});

export function normalizeMorphName(name = '') {
  return String(name).toLowerCase().replace(/[^a-z0-9]+/g, '');
}

export function classifyVisemeTarget(name = '') {
  const normalized = normalizeMorphName(name);
  for (const viseme of VISEMES) {
    if (ALIASES[viseme].has(normalized)) return viseme;
  }
  return null;
}

export function buildVisemeWeights({ timeSeconds = 0, energy = 0, speaking = false } = {}) {
  const level = Math.max(0, Math.min(1, Number(energy) || 0));
  const weights = { A: 0, I: 0, U: 0, E: 0, O: 0 };
  if (!speaking || level < 0.01) return weights;

  const phase = ((Number(timeSeconds) || 0) * 7.25) % VISEMES.length;
  const primaryIndex = Math.floor(phase);
  const secondaryIndex = (primaryIndex + 1) % VISEMES.length;
  const rawBlend = phase - primaryIndex;
  const blend = rawBlend * rawBlend * (3 - 2 * rawBlend);

  weights[VISEMES[primaryIndex]] = level * (1 - blend * 0.72);
  weights[VISEMES[secondaryIndex]] = level * blend * 0.72;
  return weights;
}

export function collectMorphVisemeChannels(root) {
  const channels = [];
  root?.traverse?.((object) => {
    if (!object?.morphTargetDictionary || !object?.morphTargetInfluences) return;
    for (const [name, index] of Object.entries(object.morphTargetDictionary)) {
      const viseme = classifyVisemeTarget(name);
      if (!viseme || !Number.isInteger(index)) continue;
      channels.push({ mesh: object, index, viseme, name });
    }
  });
  return channels;
}
