/** Inspect only data actually loaded into the scene. Never infer VRM support from the extension. */
export function getModelMetrics(model, vrm = null, type = 'unknown') {
  if (!model?.traverse) return { type, meshes: 0, bones: 0, triangles: 0, morphTargets: 0, expressions: 0, vrm: false };
  let meshes = 0;
  let bones = 0;
  let triangles = 0;
  const morphs = new Set();
  model.traverse((object) => {
    if (object.isBone) bones += 1;
    if (!object.isMesh) return;
    meshes += 1;
    const geometry = object.geometry;
    const triangleCount = geometry?.index?.count ?? geometry?.attributes?.position?.count ?? 0;
    triangles += Math.floor(triangleCount / 3);
    Object.keys(object.morphTargetDictionary || {}).forEach((name) => morphs.add(name));
  });
  const expressionManager = vrm?.expressionManager;
  return {
    type,
    meshes,
    bones,
    triangles,
    morphTargets: morphs.size,
    expressions: expressionManager?.expressions?.length ?? (vrm ? null : morphs.size),
    vrm: Boolean(vrm),
  };
}
