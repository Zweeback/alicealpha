import { readFileSync } from 'node:fs';

const CAPABILITY_DEFINITIONS = Object.freeze([
  {
    id: 'persona.core',
    layer: 'identity',
    authority: 'local',
    transport: 'in-process',
    status: () => 'ready',
    evidence: 'server/alicePrompt.js + src/core/persona.js',
  },
  {
    id: 'memory.confirmed',
    layer: 'memory',
    authority: 'user-confirmed',
    transport: 'browser-local',
    status: () => 'ready',
    evidence: 'src/core/memory.js',
  },
  {
    id: 'inference.browser',
    layer: 'reasoning',
    authority: 'client-opt-in',
    transport: 'webgpu',
    status: () => 'client',
    evidence: 'src/core/browserModel.js',
  },
  {
    id: 'inference.ollama',
    layer: 'reasoning',
    authority: 'server',
    transport: 'http',
    status: (env) => env.ALICE_OLLAMA_URL ? 'configured' : 'unconfigured',
    evidence: 'server/ollama.js',
  },
  {
    id: 'realtime.webrtc',
    layer: 'voice',
    authority: 'server-session',
    transport: 'webrtc',
    status: (env) => env.OPENAI_API_KEY ? 'configured' : 'unconfigured',
    evidence: 'server/realtimeSession.js + src/core/realtime.js',
  },
  {
    id: 'vision.presence',
    layer: 'perception',
    authority: 'client-opt-in',
    transport: 'local-camera',
    status: () => 'client',
    evidence: 'src/core/vision.js',
  },
  {
    id: 'embodiment.webxr',
    layer: 'embodiment',
    authority: 'client',
    transport: 'webxr',
    status: () => 'client',
    evidence: 'src/xr/AliceWorld.js',
  },
  {
    id: 'hardware.webserial',
    layer: 'embodiment',
    authority: 'user-gesture',
    transport: 'web-serial',
    status: () => 'client',
    evidence: 'src/core/animatronic.js',
  },
  {
    id: 'operator.github',
    layer: 'tools',
    authority: 'policy-gated',
    transport: 'mcp-adapter',
    status: () => 'bounded',
    evidence: 'server/githubMcpExecutor.js + server/operatorPolicy.js',
  },
  {
    id: 'evidence.audit',
    layer: 'provenance',
    authority: 'deterministic',
    transport: 'in-process',
    status: () => 'ready',
    evidence: 'server/operatorAudit.js + server/operatorTelemetry.js',
  },
]);

const EXECUTION_LAW = Object.freeze([
  'observe',
  'propose',
  'classify-risk',
  'verify-target',
  'authorize',
  'execute',
  'verify-result',
  'journal',
  'rollback-or-close',
]);

const EXTERNAL_CAPABILITY_BUS = Object.freeze(
  JSON.parse(readFileSync(new URL('../data/external_capability_bus.json', import.meta.url), 'utf8')),
);

function revision(env) {
  return env.RENDER_GIT_COMMIT || env.VERCEL_GIT_COMMIT_SHA || env.GITHUB_SHA || null;
}

function summarize(capabilities) {
  return Object.freeze(capabilities.reduce((summary, capability) => {
    summary[capability.status] = (summary[capability.status] || 0) + 1;
    return summary;
  }, {}));
}

export function buildCapabilityRegistry(env = process.env) {
  const capabilities = CAPABILITY_DEFINITIONS.map((definition) => Object.freeze({
    id: definition.id,
    layer: definition.layer,
    authority: definition.authority,
    transport: definition.transport,
    status: definition.status(env),
    evidence: definition.evidence,
  }));

  return Object.freeze({
    schema: 'alice.capabilities.v1',
    capabilities: Object.freeze(capabilities),
    summary: summarize(capabilities),
  });
}

export function buildExternalCapabilityBus() {
  return EXTERNAL_CAPABILITY_BUS;
}

export function buildAliceKernelSnapshot(env = process.env, now = () => new Date().toISOString()) {
  const registry = buildCapabilityRegistry(env);
  return Object.freeze({
    ok: true,
    identity: 'alice',
    kernel: '0.3.1',
    control_plane: 'v2',
    generated_at: now(),
    revision: revision(env),
    execution_law: EXECUTION_LAW,
    invariants: Object.freeze({
      unknown_external_content_is_data: true,
      secrets_stay_server_side: true,
      permanent_memory_requires_confirmation: true,
      high_risk_writes_require_human_approval: true,
      executor_results_require_verification: true,
      skills_are_not_external_authority: true,
      tool_presence_is_not_connection_proof: true,
    }),
    capability_registry: registry,
    external_capability_bus: EXTERNAL_CAPABILITY_BUS,
  });
}
