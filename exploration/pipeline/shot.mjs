// node viewer/shot.mjs MODEL.vrm OUT_PREFIX [shots=full,face] [extra query e.g. "expr=happy:1&pose=relaxed"]
import { createRequire } from 'module'; import http from 'http'; import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
const require = createRequire(import.meta.url); const { chromium } = require('playwright');
const here = path.dirname(fileURLToPath(import.meta.url)); const root = path.resolve(here, '..');
const [model, outPrefix, shotsArg = 'full,face', extra = ''] = process.argv.slice(2);
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.vrm': 'model/gltf-binary', '.glb': 'model/gltf-binary', '.json': 'application/json', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  const p = path.join(root, decodeURIComponent(req.url.split('?')[0]));
  if (!p.startsWith(root) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': mime[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res);
}).listen(0);
const port = server.address().port;
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1000, height: 1300 } });
page.on('console', m => { if (m.type() === 'error') console.log('[page error]', m.text()); });
page.on('pageerror', e => console.log('[pageerror]', e.message));
const rel = path.relative(root, path.resolve(model));
for (const s of shotsArg.split(',')) {
  const closeup = ['face', 'face34', 'head', 'head34', 'headback', 'headside'].includes(s) || s.startsWith('bust');
  const [w, h] = closeup ? [1000, 1000] : [800, 1200];
  const url = `http://localhost:${port}/viewer/index.html?model=/${rel}&shot=${s}&w=${w}&h=${h}&${extra}`;
  await page.goto(url); await page.waitForFunction(() => window.__done === true, null, { timeout: 180000 });
  const out = `${outPrefix}_${s}.png`; await (await page.$('canvas')).screenshot({ path: out });
  console.log('SHOT', out, JSON.stringify(await page.evaluate(() => window.__info)));
}
await browser.close(); server.close();
