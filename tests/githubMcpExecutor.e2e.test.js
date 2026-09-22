import { describe, expect, it } from 'vitest';
import { createOperatorEnvelope } from '../server/operatorAudit.js';
import { dispatchOperatorEnvelope } from '../server/operatorDispatch.js';
import { createGitHubMcpExecutor } from '../server/githubMcpExecutor.js';

const live = process.env.ALICE_GITHUB_MCP_LIVE === '1' ? describe : describe.skip;

live('GitHub MCP live operator loop', () => {
  it('dispatches branch.create through Alice and verifies the connector result', async () => {
    const endpoint = process.env.ALICE_GITHUB_MCP_ENDPOINT;
    const token = process.env.ALICE_GITHUB_MCP_TOKEN;
    const repository = process.env.ALICE_GITHUB_MCP_REPOSITORY ?? 'Zweeback/alicealpha';
    const baseRef = process.env.ALICE_GITHUB_MCP_BASE_REF ?? 'main';
    if (!endpoint || !token) throw new Error('live-github-mcp-config-required');

    const branch = `alice-live-e2e-${Date.now()}`;
    const invoke = async (call) => {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify(call),
      });
      if (!response.ok) throw new Error(`github-mcp-http-${response.status}`);
      return response.json();
    };

    const executor = createGitHubMcpExecutor(invoke);
    const envelope = createOperatorEnvelope({
      id: `github-mcp-live-${Date.now()}`,
      operation: 'branch.create',
      repository,
      payload: { branch, base_ref: baseRef },
    });

    const result = await dispatchOperatorEnvelope(envelope, executor);
    expect(result.completed.status).toBe('succeeded');
    expect(result.completed.detail.result.branch).toBe(branch);
  });
});
