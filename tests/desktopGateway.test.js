import { EventEmitter } from 'node:events';
import express from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDesktopGateway, desktopGatewayConfig, desktopPayloadHash, verifyJournal } from '../server/desktopGateway.js';
import { createDesktopGatewayRouter } from '../server/desktopGatewayRoutes.js';
import { buildCapabilityRegistry } from '../server/capabilityRegistry.js';
import { createClient, createExecutor, processOnce } from '../tools/alice-desktop-client.mjs';

const TOKEN = 'test-only-pairing-token-0123456789';
const ENV = { ALICE_DESKTOP_GATEWAY: '1', ALICE_DESKTOP_CLIENT_TOKEN: TOKEN };

function clock(start = Date.parse('2026-11-10T22:00:00.000Z')) {
  let t = start;
  return { now: () => t, advance: (ms) => { t += ms; } };
}

describe('desktop gateway core', () => {
  it('runs propose → deliver → human approval → reported result with a verifiable journal', () => {
    const c = clock();
    let n = 0;
    const gw = createDesktopGateway({ now: c.now, idFactory: () => `p${++n}` });
    const proposal = gw.propose({ action: 'url.open', params: { url: 'https://example.org/a' }, reason: 'Doku öffnen', source: { kind: 'user', ref: 'chat' } });
    expect(proposal.state).toBe('pending');
    expect(proposal.payload_sha256).toBe(desktopPayloadHash('url.open', { url: 'https://example.org/a' }));

    const delivered = gw.next('desktop-client:test');
    expect(delivered.id).toBe('p1');
    expect(gw.next('desktop-client:test')).toBeNull();

    gw.decide('p1', { decision: 'approved', actor: 'human:benjamin', payload_sha256: proposal.payload_sha256 });
    const done = gw.report('p1', { status: 'succeeded', payload_sha256: proposal.payload_sha256, observation: 'xdg-open exit 0' });
    expect(done.state).toBe('succeeded');
    expect(done.journal.map((e) => [e.event, e.evidence])).toEqual([
      ['proposed', 'asserted'],
      ['delivered', 'observed'],
      ['approved', 'reported'],
      ['succeeded', 'reported'],
    ]);
    expect(done.journal[2].actor).toBe('human:benjamin');
    expect(done.journal[0].at).toBe('2026-11-10T22:00:00.000Z');
    expect(verifyJournal(gw.journal())).toMatchObject({ ok: true, length: 4 });
  });

  it('detects journal tampering', () => {
    const gw = createDesktopGateway();
    gw.propose({ action: 'note.show', params: { text: 'Hallo' } });
    gw.next();
    const entries = gw.journal().map((entry) => ({ ...entry }));
    entries[0].actor = 'human:forged';
    expect(verifyJournal(entries)).toEqual({ ok: false, broken_at: 1 });
  });

  it('rejects anything outside the allowlist or with unsafe parameters', () => {
    const gw = createDesktopGateway();
    expect(() => gw.propose({ action: 'shell.run', params: { cmd: 'rm -rf /' } })).toThrow('desktop-action-not-allowed');
    expect(() => gw.propose({ action: 'url.open', params: { url: 'file:///C:/Windows' } })).toThrow('desktop-url-https-only');
    expect(() => gw.propose({ action: 'url.open', params: { url: 'javascript:alert(1)' } })).toThrow('desktop-url-https-only');
    expect(() => gw.propose({ action: 'url.open', params: { url: 'https://user:pw@example.org' } })).toThrow('desktop-url-credentials-forbidden');
    expect(() => gw.propose({ action: 'clipboard.write', params: { text: 'mein passwort ist x' } })).toThrow('desktop-secret-like-content-forbidden');
    expect(() => gw.propose({ action: 'note.show', params: { text: '' } })).toThrow('desktop-text-invalid');
    expect(gw.list()).toHaveLength(0);
  });

  it('binds decisions and results to the payload hash and requires a human actor', () => {
    const gw = createDesktopGateway({ idFactory: () => 'x' });
    const p = gw.propose({ action: 'note.show', params: { text: 'Hallo' } });
    gw.next();
    expect(() => gw.decide('x', { decision: 'approved', actor: 'human:b', payload_sha256: 'f'.repeat(64) })).toThrow('desktop-payload-hash-mismatch');
    expect(() => gw.decide('x', { decision: 'approved', actor: 'model:alice', payload_sha256: p.payload_sha256 })).toThrow('desktop-human-actor-required');
    expect(() => gw.report('x', { status: 'succeeded', payload_sha256: p.payload_sha256 })).toThrow('desktop-proposal-not-approved');
    gw.decide('x', { decision: 'rejected', actor: 'human:b', payload_sha256: p.payload_sha256 });
    expect(gw.read('x').state).toBe('rejected');
    expect(gw.read('x').journal.some((e) => e.event === 'hash-mismatch' && e.evidence === 'observed')).toBe(true);
  });

  it('expires undelivered proposals instead of executing stale requests', () => {
    const c = clock();
    const gw = createDesktopGateway({ now: c.now, ttlMs: 60_000, idFactory: () => 'old' });
    gw.propose({ action: 'note.show', params: { text: 'Später' } });
    c.advance(61_000);
    expect(gw.next()).toBeNull();
    expect(gw.read('old').state).toBe('expired');
  });

  it('is disabled unless explicitly enabled with a long pairing token', () => {
    expect(desktopGatewayConfig({}).enabled).toBe(false);
    expect(desktopGatewayConfig({ ALICE_DESKTOP_GATEWAY: '1', ALICE_DESKTOP_CLIENT_TOKEN: 'short' })).toMatchObject({ enabled: false, reason: 'client-token-missing-or-short' });
    expect(desktopGatewayConfig(ENV).enabled).toBe(true);
    const byId = Object.fromEntries(buildCapabilityRegistry({}).capabilities.map((cap) => [cap.id, cap]));
    expect(byId['operator.desktop'].status).toBe('unconfigured');
    const configured = Object.fromEntries(buildCapabilityRegistry(ENV).capabilities.map((cap) => [cap.id, cap]));
    expect(configured['operator.desktop'].status).toBe('configured');
  });
});

describe('desktop gateway HTTP + local client contract', () => {
  let server;
  afterEach(() => new Promise((resolve) => (server ? server.close(resolve) : resolve())));

  async function start(env) {
    const app = express();
    app.use('/api/desktop', createDesktopGatewayRouter({ env }));
    await new Promise((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
    return `http://127.0.0.1:${server.address().port}`;
  }

  it('reports an honest not-configured state and refuses work when disabled', async () => {
    const base = await start({});
    const status = await (await fetch(base + '/api/desktop/status')).json();
    expect(status).toMatchObject({ enabled: false, reason: 'gateway-disabled', executes_on_server: false });
    expect(status.client.connected).toBe(false);
    const proposed = await fetch(base + '/api/desktop/proposals', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'note.show', params: { text: 'x' } }) });
    expect(proposed.status).toBe(503);
  });

  it('requires the pairing token for client endpoints', async () => {
    const base = await start(ENV);
    const response = await fetch(base + '/api/desktop/client/next', { method: 'POST', headers: { authorization: 'Bearer wrong-token-wrong-token' } });
    expect(response.status).toBe(401);
  });

  it('end-to-end: UI proposal, local human approval, mocked executor, reported result', async () => {
    const base = await start(ENV);
    const created = await fetch(base + '/api/desktop/proposals', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'url.open', params: { url: 'https://github.com/Zweeback/alicealpha' }, reason: 'Repo zeigen' }),
    });
    expect(created.status).toBe(201);
    const proposal = await created.json();

    const client = createClient({ server: base, token: TOKEN, name: 'vitest' });
    const execute = vi.fn(async () => ({ status: 'succeeded', observation: 'mock opener exit 0' }));
    const outcome = await processOnce({ client, ask: async () => 'ja', execute, actor: 'human:benjamin', print: () => undefined });
    expect(outcome).toMatchObject({ handled: true, decision: 'approved' });
    expect(execute).toHaveBeenCalledOnce();

    const final = await (await fetch(`${base}/api/desktop/proposals/${proposal.id}`)).json();
    expect(final.state).toBe('succeeded');
    expect(final.result.reported_by).toBe('desktop-client:vitest');
    expect(final.journal.map((e) => e.event)).toEqual(['proposed', 'delivered', 'approved', 'succeeded']);
    const status = await (await fetch(base + '/api/desktop/status')).json();
    expect(status.client).toMatchObject({ connected: true, label: 'desktop-client:vitest' });
  });

  it('a local "nein" rejects without executing', async () => {
    const base = await start(ENV);
    await fetch(base + '/api/desktop/proposals', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'clipboard.write', params: { text: 'Hallo Welt' } }) });
    const execute = vi.fn();
    const outcome = await processOnce({ client: createClient({ server: base, token: TOKEN }), ask: async () => '', execute, actor: 'human:b', print: () => undefined });
    expect(outcome.decision).toBe('rejected');
    expect(execute).not.toHaveBeenCalled();
  });
});

describe('desktop client executor', () => {
  function fakeSpawn(code = 0) {
    const calls = [];
    const spawnImpl = (command, args, options) => {
      const child = new EventEmitter();
      child.stdin = { end: (input) => calls.at(-1).input = input };
      calls.push({ command, args, options });
      setTimeout(() => child.emit('exit', code), 0);
      return child;
    };
    return { calls, spawnImpl };
  }

  it('opens https links with a fixed program and no shell', async () => {
    const { calls, spawnImpl } = fakeSpawn();
    const result = await createExecutor({ platform: 'win32', spawnImpl })({ action: 'url.open', params: { url: 'https://example.org/?q=1&x=2' } });
    expect(calls[0]).toMatchObject({ command: 'rundll32.exe', args: ['url.dll,FileProtocolHandler', 'https://example.org/?q=1&x=2'] });
    expect(calls[0].options.shell).toBe(false);
    expect(result.status).toBe('succeeded');
  });

  it('writes the clipboard via stdin and refuses non-https even if the server were bypassed', async () => {
    const { calls, spawnImpl } = fakeSpawn();
    const execute = createExecutor({ platform: 'linux', spawnImpl });
    await execute({ action: 'clipboard.write', params: { text: 'Hallo' } });
    expect(calls[0]).toMatchObject({ command: 'xclip', input: 'Hallo' });
    await expect(execute({ action: 'url.open', params: { url: 'file:///etc/passwd' } })).rejects.toThrow('desktop-url-https-only');
    await expect(execute({ action: 'shell.run', params: {} })).rejects.toThrow('nicht freigegeben');
  });

  it('dry-run never reports success', async () => {
    const result = await createExecutor({ dryRun: true, print: () => undefined })({ action: 'note.show', params: { text: 'x' } });
    expect(result.status).toBe('failed');
  });
});

describe('desktop gateway browser labels', async () => {
  const { gatewayStatusText, createDesktopGatewayApi } = await import('../src/core/desktopGateway.js');
  it('never shows a disabled or unpaired gateway as connected', () => {
    expect(gatewayStatusText({ enabled: false, reason: 'gateway-disabled' })).toContain('nicht aktiviert');
    expect(gatewayStatusText({ enabled: true, client: { connected: false, last_seen_at: null } })).toBe('Desktop-Client nicht verbunden');
    expect(gatewayStatusText({ enabled: true, client: { connected: true, label: 'desktop-client:surface' } })).toContain('verbunden: desktop-client:surface');
  });
  it('surfaces server error codes', async () => {
    const api = createDesktopGatewayApi('', async () => new Response(JSON.stringify({ error: 'desktop-gateway-not-configured' }), { status: 503 }));
    await expect(api.propose({})).rejects.toThrow('desktop-gateway-not-configured');
  });
});
