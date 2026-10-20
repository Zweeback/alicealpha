import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export const DEVICE_COMMANDS = Object.freeze(['device_status', 'home', 'back', 'open_app']);
const COMMAND_SET = new Set(DEVICE_COMMANDS);
const PACKAGE_NAME = /^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z0-9_]+)+$/;
const NONCE = /^[A-Za-z0-9_-]{16,128}$/;
const DEVICE_ID = /^[A-Za-z0-9_.-]{1,64}$/;

function canonicalArgs(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return '{}';
  return JSON.stringify(Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))));
}

export function canonicalDeviceCommand(input) {
  return [
    String(input?.timestamp ?? ''),
    String(input?.nonce ?? ''),
    String(input?.device_id ?? ''),
    String(input?.command ?? ''),
    canonicalArgs(input?.args),
  ].join('\n');
}

export function signDeviceCommand(secret, input) {
  if (!secret) throw new Error('device-command-secret-required');
  return `sha256=${createHmac('sha256', secret).update(canonicalDeviceCommand(input)).digest('hex')}`;
}

function validSignature(secret, input, provided) {
  if (!secret || typeof provided !== 'string') return false;
  const expected = signDeviceCommand(secret, input);
  const left = Buffer.from(expected);
  const right = Buffer.from(provided);
  return left.length === right.length && timingSafeEqual(left, right);
}

function validateCommand(input, now, maxSkewMs) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('device-command-body-invalid');
  if (!Number.isInteger(input.timestamp)) throw new Error('device-command-timestamp-invalid');
  if (Math.abs(now - input.timestamp) > maxSkewMs) throw new Error('device-command-expired');
  if (!NONCE.test(input.nonce || '')) throw new Error('device-command-nonce-invalid');
  if (!DEVICE_ID.test(input.device_id || '')) throw new Error('device-command-device-id-invalid');
  if (!COMMAND_SET.has(input.command)) throw new Error('device-command-not-allowed');
  if (input.args !== undefined && (!input.args || typeof input.args !== 'object' || Array.isArray(input.args))) {
    throw new Error('device-command-args-invalid');
  }
  const args = input.args || {};
  if (input.command === 'open_app') {
    if (!PACKAGE_NAME.test(args.package || '')) throw new Error('device-command-package-invalid');
  } else if (Object.keys(args).length > 0) {
    throw new Error('device-command-args-not-allowed');
  }
  return Object.freeze({
    timestamp: input.timestamp,
    nonce: input.nonce,
    device_id: input.device_id,
    command: input.command,
    args: Object.freeze({ ...args }),
  });
}

export function createHttpDeviceExecutor({ url, token, fetchImpl = fetch, timeoutMs = 10000 } = {}) {
  if (!url || !token) return null;
  const target = new URL('/v1/commands', url).toString();
  return async (command) => {
    const response = await fetchImpl(target, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(command),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) throw new Error(`device-bridge-rejected:${response.status}`);
    const result = await response.json().catch(() => ({}));
    return {
      ok: true,
      bridge_status: response.status,
      evidence_id: typeof result.evidence_id === 'string' ? result.evidence_id : null,
    };
  };
}

export function createDeviceGateway({
  secret,
  enabled = false,
  executor = null,
  clock = () => Date.now(),
  maxSkewMs = 30000,
} = {}) {
  const seen = new Map();

  function prune(now) {
    for (const [nonce, expiresAt] of seen) if (expiresAt <= now) seen.delete(nonce);
  }

  return Object.freeze({
    status() {
      return Object.freeze({
        configured: Boolean(secret),
        execution_enabled: Boolean(enabled),
        executor_available: typeof executor === 'function',
        mode: enabled ? 'execute' : 'dry-run',
        allowed_commands: DEVICE_COMMANDS,
      });
    },

    async handle(input, signature) {
      const now = clock();
      prune(now);
      if (!secret) throw new Error('device-command-not-configured');
      if (!validSignature(secret, input, signature)) throw new Error('device-command-signature-invalid');
      const command = validateCommand(input, now, maxSkewMs);
      if (seen.has(command.nonce)) throw new Error('device-command-replay');
      seen.set(command.nonce, now + maxSkewMs * 2);

      const commandSha256 = createHash('sha256').update(canonicalDeviceCommand(command)).digest('hex');
      const base = {
        ok: true,
        accepted: true,
        executed: false,
        mode: enabled ? 'execute' : 'dry-run',
        device_id: command.device_id,
        command: command.command,
        command_sha256: commandSha256,
        received_at: new Date(now).toISOString(),
      };
      if (!enabled) return Object.freeze(base);
      if (typeof executor !== 'function') throw new Error('device-executor-unavailable');
      const evidence = await executor(command);
      return Object.freeze({ ...base, executed: true, evidence });
    },
  });
}
