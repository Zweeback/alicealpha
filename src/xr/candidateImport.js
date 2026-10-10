// Browser-only, local-first Alice candidate import. Never auto-approves an asset.
export const MAX_CANDIDATE_BYTES = 25 * 1024 * 1024;

export function validateCandidateFile(file) {
  if (!file || typeof file.name !== 'string') throw new Error('Keine Datei ausgewählt.');
  if (!/\.(glb|vrm)$/i.test(file.name)) throw new Error('Bitte eine GLB- oder VRM-Datei auswählen.');
  if (!Number.isSafeInteger(file.size) || file.size < 20 || file.size > MAX_CANDIDATE_BYTES) {
    throw new Error('Die Datei muss zwischen 20 Byte und 25 MB groß sein.');
  }
  return true;
}

export function validateGlbHeader(buffer) {
  if (!(buffer instanceof ArrayBuffer) || buffer.byteLength < 20) throw new Error('Unvollständiger GLB-Header.');
  const head = new DataView(buffer, 0, 12);
  if (head.getUint32(0, true) !== 0x46546c67) throw new Error('Ungültiges GLB-Magic.');
  if (head.getUint32(4, true) !== 2) throw new Error('Nur glTF 2.0 wird unterstützt.');
  if (head.getUint32(8, true) !== buffer.byteLength) throw new Error('GLB-Länge stimmt nicht mit Dateigröße überein.');
  return true;
}

export function inspectCandidateScene(gltf) {
  const root = gltf?.scene || gltf?.scenes?.[0];
  if (!root || typeof root.traverse !== 'function') throw new Error('Keine darstellbare 3D-Szene enthalten.');
  let meshes = 0, skinned = 0, triangles = 0, bones = 0, morphs = 0;
  const targets = new Set();
  root.traverse((obj) => {
    if (obj.isBone) bones++;
    if (!obj.isMesh) return;
    meshes++;
    if (obj.isSkinnedMesh) skinned++;
    const g = obj.geometry;
    const n = g?.index?.count ?? g?.attributes?.position?.count ?? 0;
    triangles += Math.floor(n / 3);
    morphs += g?.morphAttributes?.position?.length || 0;
    for (const name of Object.keys(obj.morphTargetDictionary || {})) targets.add(name);
  });
  if (!meshes) throw new Error('Das Modell enthält kein Mesh.');
  return {
    meshes, skinned, triangles, bones, morphs,
    expressionNames: [...targets].sort(),
    animations: gltf.animations?.length || 0,
    rigReady: skinned > 0 && bones > 0,
    status: 'unapproved_candidate',
  };
}
