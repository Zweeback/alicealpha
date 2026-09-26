import { describe, expect, it, vi } from 'vitest';
import { mayEnterAliceContext } from '../server/sourceArtifact.js';
import {
  createWebCaptureArtifact,
  fetchPublicWebPage,
  validatePublicWebUrl,
  verifyWebIntakeBearer,
} from '../server/webIntake.js';

const publicLookup = async () => [{ address: '93.184.216.34', family: 4 }];

describe('Alice public web intake', () => {
  it('rejects private and loopback targets before network access', async () => {
    await expect(validatePublicWebUrl('http://127.0.0.1:8787/api/health')).rejects.toThrow(
      'web-intake-private-address-denied',
    );

    await expect(
      validatePublicWebUrl('https://internal.example', {
        lookup: async () => [{ address: '10.0.0.7', family: 4 }],
      }),
    ).rejects.toThrow('web-intake-private-address-denied');
  });

  it('captures public HTML as untrusted provenance and keeps it pending', async () => {
    const fetchImpl = vi.fn(async () => new Response(
      '<html><head><title>Alice &amp; Web</title><script>ignore()</script></head><body><h1>Hello</h1><p>Public fact.</p></body></html>',
      { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } },
    ));

    const capture = await fetchPublicWebPage('https://example.com/article', {
      fetchImpl,
      lookup: publicLookup,
      now: () => '2026-09-26T20:00:00.000Z',
    });

    expect(capture.title).toBe('Alice & Web');
    expect(capture.text).toContain('Hello');
    expect(capture.text).toContain('Public fact.');
    expect(capture.text).not.toContain('ignore()');
    expect(capture.trust).toBe('untrusted-external-data');
    expect(capture.executable_instructions).toBe(false);
    expect(capture.sha256).toMatch(/^[a-f0-9]{64}$/);

    const artifact = createWebCaptureArtifact(capture, { purpose: 'Research a public source' });
    expect(artifact.kind).toBe('web_capture');
    expect(artifact.provider).toBe('public_web');
    expect(artifact.approval).toBe('pending');
    expect(mayEnterAliceContext(artifact)).toBe(false);
  });

  it('revalidates redirect targets so a public URL cannot bounce into localhost', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, {
      status: 302,
      headers: { location: 'http://127.0.0.1:8787/api/alice' },
    }));

    await expect(fetchPublicWebPage('https://example.com/start', {
      fetchImpl,
      lookup: publicLookup,
    })).rejects.toThrow('web-intake-private-address-denied');
  });

  it('requires an exact bearer token', () => {
    expect(verifyWebIntakeBearer('Bearer web-secret', 'web-secret')).toBe(true);
    expect(verifyWebIntakeBearer('Bearer wrong', 'web-secret')).toBe(false);
    expect(verifyWebIntakeBearer(undefined, 'web-secret')).toBe(false);
  });
});
