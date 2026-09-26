import { test, expect, chromium } from '@playwright/test';
import fs from 'node:fs';
import { resolveAvatarSelection } from '../src/xr/avatarCatalog.js';

const LOCAL = 'http://127.0.0.1:8791/';
const LIVE = 'https://alicealpha.onrender.com/';


test('default avatar selection obeys the fail-closed character manifest', async () => {
  const manifest = JSON.parse(fs.readFileSync('public/ALICE_CHARACTER_MANIFEST.json', 'utf8'));
  expect(manifest.fallbackPolicy?.defaultMayUseCandidateWithoutApproval).toBe(false);

  const selected = resolveAvatarSelection('');
  const candidateIsApproved = selected?.provenance?.approved === true;
  if (selected.status === 'candidate' && !candidateIsApproved) {
    expect(selected.id, 'unapproved candidate must never be the default avatar').toBe('procedural');
  }
});

test('runtime/package/PWA cache versions do not drift', async () => {
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  const capabilitySource = fs.readFileSync('server/capabilityRegistry.js', 'utf8');
  const sw = fs.readFileSync('public/sw.js', 'utf8');
  const kernel = capabilitySource.match(/kernel:\s*['"`]([^'"`]+)['"`]/)?.[1]
    || capabilitySource.match(/kernel\s*=\s*['"`]([^'"`]+)['"`]/)?.[1]
    || capabilitySource.match(/kernel[^\n]*['"`](\d+\.\d+\.\d+)['"`]/)?.[1];

  expect(kernel, 'kernel version must be discoverable').toBeTruthy();
  expect(pkg.version, 'package version must track kernel version').toBe(kernel);
  expect(sw, 'service-worker cache namespace must track kernel version').toContain(`alice-v${kernel}`);
});

test('Alice remains usable when WebGL is unavailable', async () => {
  const browser = await chromium.launch({ headless: true, args: ['--disable-webgl', '--disable-gpu'] });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(String(error)));

  await page.goto(LOCAL, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await expect(page.locator('.presence-header')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('button', { name: 'Texteingabe öffnen' })).toBeVisible({ timeout: 15_000 });
  expect(pageErrors, 'WebGL loss must degrade instead of throwing an uncaught page error').toEqual([]);
  await browser.close();
});

test('camera and microphone denial still leaves a working text fallback', async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  await context.route('**/api/health', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ ok: true, realtime: true, model: 'audit-model' }),
  }));
  await context.route('**/api/realtime/session', route => route.fulfill({
    status: 429,
    contentType: 'application/json',
    body: JSON.stringify({ error: 'audit-quota' }),
  }));

  const page = await context.newPage();
  await page.goto(LOCAL, { waitUntil: 'networkidle', timeout: 60_000 });
  await page.getByRole('button', { name: 'Texteingabe öffnen' }).click({ force: true });
  await page.locator('#alice-text').fill('Audit fallback');
  await page.locator('form.text-fallback').evaluate(form => form.requestSubmit());

  await expect(page.locator('.alice-caption')).not.toHaveText('', { timeout: 30_000 });
  await expect(page.locator('.live-state')).not.toContainText('Verbindung unterbrochen', { timeout: 30_000 });
  await browser.close();
});

test('MCP returns structured JSON for malformed JSON instead of an HTML error page', async ({ request }) => {
  const response = await request.post(`${LOCAL}mcp`, {
    headers: { 'content-type': 'application/json' },
    data: '{"jsonrpc":"2.0",',
  });
  expect(response.status()).toBe(400);
  expect(response.headers()['content-type'] || '').toContain('application/json');
  const body = await response.text();
  expect(() => JSON.parse(body)).not.toThrow();
});

test('MCP initialize and tools/list are callable', async ({ request }) => {
  const init = await request.post(`${LOCAL}mcp`, {
    data: { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} },
  });
  expect(init.ok()).toBe(true);
  const initBody = await init.json();
  expect(initBody.result).toBeTruthy();

  const list = await request.post(`${LOCAL}mcp`, {
    data: { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} },
  });
  expect(list.ok()).toBe(true);
  const listBody = await list.json();
  expect(Array.isArray(listBody.result?.tools)).toBe(true);
  expect(listBody.result.tools.length).toBeGreaterThan(0);
});

test('canonical portrait survives loss of the external image host', async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.route('https://cdn.openart.ai/**', route => route.abort());

  await page.goto(`${LOCAL}?visual=portrait`, { waitUntil: 'networkidle', timeout: 60_000 });
  const image = page.locator('.canonical-alice-portrait img');
  await expect(image).toBeVisible();
  const naturalWidth = await image.evaluate(node => node.naturalWidth);
  expect(naturalWidth, 'canonical identity must be served locally, not depend on a third-party CDN').toBeGreaterThan(0);
  await browser.close();
});

test('installed PWA can reopen the shell offline', async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto(LOCAL, { waitUntil: 'networkidle', timeout: 60_000 });
  await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) throw new Error('service-worker-unavailable');
    await navigator.serviceWorker.ready;
  });
  await page.reload({ waitUntil: 'networkidle' });
  await context.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 30_000 });
  await expect(page.locator('.identity strong')).toHaveText('Alice', { timeout: 15_000 });

  await context.setOffline(false);
  await browser.close();
});

test('mobile shell does not horizontally overflow at 320px', async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 320, height: 568 } });
  await page.goto(LOCAL, { waitUntil: 'networkidle', timeout: 60_000 });
  const metrics = await page.evaluate(() => ({
    innerWidth: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.innerWidth + 1);
  await browser.close();
});

test('live health does not claim Realtime healthy when the real session endpoint is quota-blocked', async () => {
  test.setTimeout(120_000);
  const browser = await chromium.launch({
    headless: true,
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'],
  });
  const context = await browser.newContext({ permissions: ['microphone', 'camera'] });
  const page = await context.newPage();
  await page.addInitScript(() => { window.__auditRealtimeStatus = null; });
  page.on('response', response => {
    if (response.url().includes('/api/realtime/session')) {
      page.evaluate(status => { window.__auditRealtimeStatus = status; }, response.status()).catch(() => undefined);
    }
  });

  await page.goto(LIVE, { waitUntil: 'networkidle', timeout: 90_000 });
  await page.getByRole('button', { name: 'Texteingabe öffnen' }).click({ force: true });
  await page.locator('#alice-text').fill('AUDIT');
  await page.locator('form.text-fallback').evaluate(form => form.requestSubmit());
  await expect.poll(() => page.evaluate(() => window.__auditRealtimeStatus), { timeout: 45_000 }).not.toBeNull();

  const status = await page.evaluate(() => window.__auditRealtimeStatus);
  const health = await (await context.request.get(`${LIVE}api/health`)).json();
  if (status === 429) {
    expect(health.realtime, 'health must not report Realtime healthy while session creation is 429').toBe(false);
  } else {
    expect(status).toBe(200);
    expect(health.realtime).toBe(true);
  }
  await browser.close();
});


test('PWA reopens from service-worker storage after browser HTTP cache is cleared', async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto(LOCAL, { waitUntil: 'networkidle', timeout: 60_000 });
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload({ waitUntil: 'networkidle', timeout: 60_000 });

  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.clearBrowserCache');
  await context.setOffline(true);

  await page.reload({ waitUntil: 'domcontentloaded', timeout: 30_000 }).catch(() => undefined);
  await expect(page.locator('.identity strong')).toHaveText('Alice', { timeout: 15_000 });

  await context.setOffline(false);
  await browser.close();
});

test('public Realtime key proxy has explicit abuse protection', async () => {
  const source = fs.readFileSync('server/index.js', 'utf8');
  const start = source.indexOf("app.post('/api/realtime/session'");
  const end = source.indexOf('app.use(express.static', start);
  expect(start).toBeGreaterThanOrEqual(0);
  const route = source.slice(start, end > start ? end : undefined);

  expect(
    /rateLimit|rateLimiter|throttl/i.test(route),
    'Realtime endpoint needs request throttling before it can proxy a server-side paid API key',
  ).toBe(true);
  expect(
    /authorization|ALICE_[A-Z_]*TOKEN|x-alice|allowedOrigin|originAllow/i.test(route),
    'Realtime endpoint needs an access gate or explicit trusted-origin policy',
  ).toBe(true);
});
