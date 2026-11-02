// Mini-Static-Server für Tests/Entwicklung: node serve.mjs [port]
import http from 'http'; import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
const root = path.dirname(fileURLToPath(import.meta.url)); const port = +(process.argv[2] || 4173);
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.vrm': 'model/gltf-binary', '.png': 'image/png', '.glb': 'model/gltf-binary', '.json': 'application/json' };
http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]); const p = path.join(root, u === '/' ? '/index.html' : u);
  if (!p.startsWith(root) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': mime[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res);
}).listen(port, () => console.log('serving on', port));
