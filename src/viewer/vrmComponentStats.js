export function collectWorkbenchSnapshot(workbench) {
  const parts = [];
  const morphs = new Set();

  workbench.model?.traverse((object) => {
    if (!object.isMesh) return;
    parts.push({
      name: object.name || 'Mesh',
      visible: object.visible,
      uuid: object.uuid,
    });
    Object.keys(object.morphTargetDictionary || {}).forEach((name) => morphs.add(name));
  });

  const bones = Array.isArray(workbench.bones)
    ? workbench.bones.map((item) => item.name)
    : [];

  return {
    parts,
    stats: {
      type: workbench.type || 'unknown',
      boneCount: bones.length,
      meshCount: typeof workbench.countMeshes === 'function'
        ? workbench.countMeshes()
        : parts.length,
      bones,
      morphs: [...morphs].sort((a, b) => a.localeCompare(b)),
    },
  };
}
