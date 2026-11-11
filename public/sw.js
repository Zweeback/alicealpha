const CACHE = 'alice-v0.3.0';
const ASSETS = `${CACHE}-assets`;
const CORE = ['./', './index.html', './manifest.webmanifest', './alice-mark.svg', './alice-reference.jpg'];
const MAX_ASSETS = 80;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(CORE)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key !== CACHE && key !== ASSETS).map((key) => caches.delete(key)),
    )),
  );
  self.clients.claim();
});

// Gehashte Build-Dateien (/assets/…) ändern ihren Namen mit jedem Inhalt: Cache zuerst ist sicher
// und hält Schriften, three.js und App-Code offline und beim zweiten Besuch sofort verfügbar.
async function assetFirst(request) {
  const cache = await caches.open(ASSETS);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok) {
    await cache.put(request, response.clone());
    const keys = await cache.keys();
    await Promise.all(keys.slice(0, Math.max(0, keys.length - MAX_ASSETS)).map((key) => cache.delete(key)));
  }
  return response;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // Live-Schnittstellen (Chat, Realtime, MCP) niemals aus dem Cache beantworten.
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/mcp')) return;

  if (url.pathname.includes('/assets/')) {
    event.respondWith(assetFirst(request));
    return;
  }
  event.respondWith(fetch(request).catch(() => caches.match(request).then((hit) => hit || caches.match('./'))));
});
