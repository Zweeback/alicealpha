// LS is a read-only capability frame unless an adapter returns runtime evidence.
// Account subscriptions and design documents are NEVER evidence of a live API.
export const LS_CAPABILITIES = Object.freeze([
  { id: 'alice', label: 'Alice', channel: 'avatar', adapter: 'local', gate: 'identity-pending', access: 'runtime' },
  { id: 'github', label: 'GitHub', channel: 'code', adapter: 'github-app', gate: 'review-before-merge', access: 'external' },
  { id: 'codespaces', label: 'GitHub Codespaces', channel: 'development', adapter: 'devcontainer', gate: 'active-session-required', access: 'external' },
  { id: 'jules', label: 'Jules', channel: 'code', adapter: 'jules-v1alpha', gate: 'api-key-and-source-required', access: 'external' },
  { id: 'copilot', label: 'Copilot', channel: 'code', adapter: 'github-issue-agent', gate: 'agent-enabled-and-review-required', access: 'external' },
  { id: 'claude', label: 'Claude Cowork', channel: 'reasoning', adapter: 'manual-cowork', gate: 'account-and-connector-required', access: 'external' },
  { id: 'gemini', label: 'Gemini', channel: 'reasoning', adapter: 'gemini-api', gate: 'api-project-required', access: 'external' },
  { id: 'grok', label: 'Grok', channel: 'reasoning', adapter: 'xai-api', gate: 'api-access-required', access: 'external' },
  { id: 'grok-bot', label: 'Grok Bot', channel: 'coding', adapter: 'not-configured', gate: 'identify-official-agent-endpoint', access: 'external' },
  { id: 'grok-imagine', label: 'Grok Imagine', channel: 'media', adapter: 'not-configured', gate: 'verify-entitlement-and-media-api', access: 'external' },
  { id: 'chatgpt-library', label: 'ChatGPT Library', channel: 'archives', adapter: 'chat-scoped-files', gate: 'file-scope-and-provenance-required', access: 'external' },
  { id: 'metamorphose', label: 'Bentropy Metamorphose', channel: 'evidence', adapter: 'charming-operations', gate: 'app-auth-and-provenance-required', access: 'external' },
  { id: 'chatgpt-work', label: 'ChatGPT Work', channel: 'agent', adapter: 'user-selected-mode', gate: 'user-work-mode-and-permissions', access: 'external' },
  { id: 'drive', label: 'Google Drive', channel: 'archive', adapter: 'drive-connector', gate: 'user-auth-and-scope-required', access: 'external' },
  { id: 'scriptdb', label: 'ScriptDB', channel: 'scripts', adapter: 'not-configured', gate: 'source-and-permission-required', access: 'external' },
  { id: 'library', label: 'Stadt- und Landesbibliothek Dortmund', channel: 'research', adapter: 'public-catalog', gate: 'licence-and-library-card-for-protected-content', access: 'public' },
  { id: 'colab', label: 'Google Colab', channel: 'compute', adapter: 'manual-notebook', gate: 'gpu-quota-and-interactive-session', access: 'external' },
]);
const statuses = new Set(['verified', 'partial', 'pending', 'blocked']);
const evidenceRequired = (status) => status === 'verified';
export function createCapabilityFrame(observations = {}, now = new Date().toISOString()) {
  return {
    schema: 1,
    capturedAt: now,
    sources: LS_CAPABILITIES.map((source) => {
      const evidence = observations[source.id] || {};
      const status = statuses.has(evidence.status) ? evidence.status : 'pending';
      const citation = typeof evidence.evidence === 'string' ? evidence.evidence.trim().slice(0, 420) : '';
      return {
        ...source,
        status: evidenceRequired(status) && !citation ? 'pending' : status,
        evidence: citation || null,
      };
    }),
  };
}
export function clearanceForAsset(asset, { manifest = null, visualReview = null } = {}) {
  const issues = [];
  if (!asset?.path || !asset?.sha256) issues.push('asset-provenance-incomplete');
  if (!manifest?.approvedAsset || manifest.approvedAsset !== asset?.path) issues.push('not-approved-in-manifest');
  if (manifest?.approval?.status !== 'approved') issues.push('approval-pending');
  if (visualReview?.status !== 'pass' || !visualReview?.evidence) issues.push('visual-identity-unverified');
  if (asset?.rigged !== true) issues.push('facial-rig-unverified');
  return { approved: issues.length === 0, issues };
}
