import { test, expect, chromium } from '@playwright/test';

const APP_URL = 'https://alicealpha.onrender.com/';
const LOCAL_APP_URL = 'http://127.0.0.1:8790/';

test('public Alice loads and supports text interaction', async () => {
  test.setTimeout(150_000);

  const browser = await chromium.launch({ headless: true, args: ['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream','--autoplay-policy=no-user-gesture-required'] });
  const context = await browser.newContext({ permissions: ['microphone'] });
  const page = await context.newPage();

  await page.goto(APP_URL, { waitUntil: 'networkidle', timeout: 90_000 });
  await expect(page.locator('.live-state')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Texteingabe öffnen' }).click({ force: true });
  await page.locator('#alice-text').fill('Antworte bitte nur mit dem Wort TEST.');
  await page.locator('form.text-fallback').evaluate(form => form.requestSubmit());

  await expect.poll(async () => ((await page.locator('.alice-caption').textContent().catch(() => '')) || '').trim().length > 0, { timeout: 60_000 }).toBe(true);

  await context.close();
  await browser.close();
});

test('touching Alice activates speech pipeline state', async () => {
  test.setTimeout(120_000);
  const browser = await chromium.launch({ headless: true, args: ['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream','--autoplay-policy=no-user-gesture-required'] });
  const context = await browser.newContext({ permissions: ['microphone'] });
  const page = await context.newPage();

  await page.goto(APP_URL, { waitUntil: 'networkidle', timeout: 90_000 });
  await expect(page.locator('.live-state')).toBeVisible({ timeout: 30_000 });

  await page.keyboard.press('Space');
  await expect(page.locator('.live-state')).toContainText('Ich höre zu', { timeout: 30_000 });

  await context.close();
  await browser.close();
});

test('quota failure or local mode exposes browser AI entry if WebLLM available', async () => {
  test.setTimeout(600_000);
  const browser = await chromium.launch({ headless: true, args: ['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream','--autoplay-policy=no-user-gesture-required'] });
  const context = await browser.newContext({ permissions: ['microphone'] });
  const page = await context.newPage();

  await page.goto(LOCAL_APP_URL, { waitUntil: 'networkidle', timeout: 90_000 });
  await expect(page.locator('.live-state')).toBeVisible({ timeout: 30_000 });

  const webgpu = await page.evaluate(async () => {
    if (!navigator.gpu) return { available: false, adapter: false };
    const adapter = await navigator.gpu.requestAdapter().catch(() => null);
    return { available: true, adapter: Boolean(adapter) };
  });

  if (!webgpu.available || !webgpu.adapter) {
    console.log('ALICE_WEBGPU_UNAVAILABLE', JSON.stringify(webgpu));
    test.skip(true, 'WebGPU adapter unavailable in this runner');
  }

  const inference = await page.evaluate(async () => {
    const module = await import('https://esm.run/@mlc-ai/web-llm');
    const engine = await module.CreateMLCEngine('Qwen2.5-0.5B-Instruct-q4f16_1-MLC');
    const response = await engine.chat.completions.create({ messages: [{ role: 'user', content: 'Reply with exactly OK' }], temperature: 0, max_tokens: 2 });
    return String(response?.choices?.[0]?.message?.content || '').trim();
  });

  expect(inference.length).toBeGreaterThan(0);
  await context.close();
  await browser.close();
});
