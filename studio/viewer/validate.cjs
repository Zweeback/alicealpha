const v = require('gltf-validator'); const fs = require('fs');
const data = new Uint8Array(fs.readFileSync(process.argv[2]));
v.validateBytes(data, {maxIssues: 300}).then(r => {
  const i = r.issues;
  console.log('errors', i.numErrors, 'warnings', i.numWarnings, 'infos', i.numInfos, 'hints', i.numHints);
  for (const m of i.messages.slice(0, 40)) console.log(m.severity, m.code, m.pointer, '-', m.message);
  console.log('info', JSON.stringify({v: r.info.version, tri: r.info.totalTriangleCount, vtx: r.info.totalVertexCount, mats: r.info.materialCount, anim: r.info.animationCount, ext: r.info.extensionsUsed}));
});
