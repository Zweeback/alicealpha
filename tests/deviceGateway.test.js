import { describe, expect, it, vi } from 'vitest';
import { createDeviceGateway, createHttpDeviceExecutor, signDeviceCommand } from '../server/deviceGateway.js';

const SECRET = 'test-only-command-secret';
const NOW = 1790900000000;

function command(overrides = {}) {
  return {
    timestamp: NOW,
    nonce: 'nonce_1234567890abcdef',
    device_id: 'pixel-9a',
    command: 'device_status',
    args: {},
    ...overrides,
  };
}

describe('Alice device webhook gateway', () => {
  it('accepts a signed command but stays dry-run by default', async () => {
    const gateway = createDeviceGateway({ secret: SECRET, clock: () => NOW });
    const input = command();
    const result = await gateway.handle(input, signDeviceCommand(SECRET, input));
    expect(result).toMatchObject({ ok: true, accepted: true, executed: false, mode: 'dry-run' });
    expect(result.command_sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('rejects invalid signatures, expired timestamps and nonce replay', async () => {
    const gateway = createDeviceGateway({ secret: SECRET, clock: () => NOW });
    const input = command();
    await expect(gateway.handle(input, 'sha256=invalid')).rejects.toThrow('device-command-signature-invalid');
    const expired = command({ timestamp: NOW - 30001, nonce: 'nonce_expired_123456' });
    await expect(gateway.handle(expired, signDeviceCommand(SECRET, expired))).rejects.toThrow('device-command-expired');
    await gateway.handle(input, signDeviceCommand(SECRET, input));
    await expect(gateway.handle(input, signDeviceCommand(SECRET, input))).rejects.toThrow('device-command-replay');
  });

  it('fails closed on arbitrary actions and validates Android package names', async () => {
    const gateway = createDeviceGateway({ secret: SECRET, clock: () => NOW });
    const shell = command({ command: 'shell', nonce: 'nonce_shell_12345678' });
    await expect(gateway.handle(shell, signDeviceCommand(SECRET, shell))).rejects.toThrow('device-command-not-allowed');
    const invalidApp = command({ command: 'open_app', nonce: 'nonce_openapp_123456', args: { package: 'youtube' } });
    await expect(gateway.handle(invalidApp, signDeviceCommand(SECRET, invalidApp))).rejects.toThrow('device-command-package-invalid');
  });

  it('requires both explicit execution enablement and a real executor', async () => {
    const noExecutor = createDeviceGateway({ secret: SECRET, enabled: true, clock: () => NOW });
    const input = command();
    await expect(noExecutor.handle(input, signDeviceCommand(SECRET, input))).rejects.toThrow('device-executor-unavailable');

    const executor = vi.fn().mockResolvedValue({ ok: true, evidence_id: 'pixel-proof-1' });
    const gateway = createDeviceGateway({ secret: SECRET, enabled: true, executor, clock: () => NOW });
    const executed = await gateway.handle(input, signDeviceCommand(SECRET, input));
    expect(executed.executed).toBe(true);
    expect(executed.evidence.evidence_id).toBe('pixel-proof-1');
    expect(executor).toHaveBeenCalledOnce();
  });

  it('keeps the bridge token server-side and returns only bounded evidence', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 202,
      json: async () => ({ evidence_id: 'bridge-event-7', secret: 'must-not-propagate' }),
    });
    const executor = createHttpDeviceExecutor({ url: 'https://bridge.invalid/base', token: 'private-token', fetchImpl });
    const result = await executor(command());
    expect(result).toEqual({ ok: true, bridge_status: 202, evidence_id: 'bridge-event-7' });
    expect(fetchImpl.mock.calls[0][1].headers.authorization).toBe('Bearer private-token');
  });
});
