import { test, expect, chromium } from '@playwright/test';
import { PNG } from 'pngjs';

const LOCAL = process.env.ALICE_URL || 'http://127.0.0.1:8791/';

test.setTimeout(60000);

for (const q of ['', '?procedural=1', '?avatar=vrm']) {
  test(`renders a visible 3D Alice for "${q || '(no query)'}"`, async () => {
    const browser = await chromium.launch({
      headless: true,
      args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
    });
    const ctx = await browser.newContext({ permissions: [] });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));

    await page.goto(LOCAL + q, { waitUntil: 'networkidle' });
    await expect(page.locator('.alice-app')).toHaveClass(/visual-3d/);
    await expect(page.locator('.canonical-alice-portrait')).toHaveCount(0);
    await expect(page.locator('img[src$="alice-mark.svg"]')).toHaveCount(0);

    const canvas = page.locator('canvas');
    await expect(canvas).toBeVisible();
    await page.waitForTimeout(2500);

    // Pixel check: centre of the stage must contain non-background (skin/hair) pixels
    const png = await canvas.screenshot();
    const img = PNG.sync.read(png);
    let lit = 0;
    for (let i = 0; i < img.data.length; i += 4) {
      if (img.data[i] + img.data[i + 1] + img.data[i + 2] > 180) {
        lit++;
      }
    }
    expect(lit / (img.width * img.height)).toBeGreaterThan(0.02);
    expect(errors).toEqual([]);
    await ctx.close();
    await browser.close();
  });
}
