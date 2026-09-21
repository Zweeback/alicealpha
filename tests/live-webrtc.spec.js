import { test, expect } from '@playwright/test';

const APP_URL = 'https://alicealpha.onrender.com/';

test('public Alice opens a real WebRTC session and returns a live response', async ({ browser }) => {
  const context = await browser.newContext({
    permissions: ['microphone', 'camera'],
  });

  const page = await context.newPage();

  await page.addInitScript(() => {
    window.__aliceProbe = {
      peerCreated: false,
      dataChannelCreated: false,
      dataChannelOpen: false,
      microphoneGranted: false,
      remoteAudioTrack: false,
      mediaPlayCalled: false,
      sessionStatus: null,
    };

    const NativePC = window.RTCPeerConnection;
    class ProbedRTCPeerConnection extends NativePC {
      constructor(...args) {
        super(...args);
        window.__aliceProbe.peerCreated = true;
        this.addEventListener('track', (event) => {
          if (event.track?.kind === 'audio') window.__aliceProbe.remoteAudioTrack = true;
        });
      }

      createDataChannel(label, options) {
        window.__aliceProbe.dataChannelCreated = true;
        const channel = super.createDataChannel(label, options);
        channel.addEventListener('open', () => {
          window.__aliceProbe.dataChannelOpen = true;
        });
        return channel;
      }
    }
    window.RTCPeerConnection = ProbedRTCPeerConnection;

    const originalGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async (...args) => {
      const stream = await originalGetUserMedia(...args);
      if (stream.getAudioTracks().length > 0) window.__aliceProbe.microphoneGranted = true;
      return stream;
    };

    const originalPlay = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function (...args) {
      window.__aliceProbe.mediaPlayCalled = true;
      return originalPlay.apply(this, args);
    };
  });

  page.on('response', (response) => {
    if (response.url().includes('/api/realtime/session')) {
      page.evaluate((status) => { window.__aliceProbe.sessionStatus = status; }, response.status()).catch(() => undefined);
    }
  });

  await page.goto(APP_URL, { waitUntil: 'networkidle', timeout: 90_000 });

  await expect(page.locator('.live-state')).toContainText('Bereit', { timeout: 30_000 });

  await page.getByRole('button', { name: 'Texteingabe öffnen' }).click();
  await page.locator('#alice-text').fill('Antworte bitte nur mit dem Wort TEST.');
  await page.getByRole('button', { name: 'Senden' }).click();

  await expect.poll(async () => {
    return page.evaluate(() => window.__aliceProbe.sessionStatus);
  }, { timeout: 45_000 }).toBe(200);

  await expect.poll(async () => {
    return page.evaluate(() => window.__aliceProbe.dataChannelOpen);
  }, { timeout: 45_000 }).toBe(true);

  await expect.poll(async () => {
    return page.evaluate(() => window.__aliceProbe.remoteAudioTrack);
  }, { timeout: 45_000 }).toBe(true);

  await expect.poll(async () => {
    const text = await page.locator('.alice-caption').textContent().catch(() => '');
    return (text || '').trim().length > 0;
  }, { timeout: 60_000 }).toBe(true);

  const probe = await page.evaluate(() => window.__aliceProbe);
  expect(probe.peerCreated).toBe(true);
  expect(probe.dataChannelCreated).toBe(true);
  expect(probe.dataChannelOpen).toBe(true);
  expect(probe.microphoneGranted).toBe(true);
  expect(probe.remoteAudioTrack).toBe(true);
  expect(probe.sessionStatus).toBe(200);

  await context.close();
});
