import { describe, expect, it, vi } from 'vitest';
import { createOperatorEnvelope } from '../server/operatorAudit.js';
import { dispatchOperatorEnvelope } from '../server/operatorDispatch.js';
import { createGitHubMcpExecutor } from '../server/githubMcpExecutor.js';

describe('GitHub MCP runtime binding', () => {
  it('maps a validated Alice branch.create envelope to the authenticated connector contract', async () => {
    const invoke = vi.fn(async (call) => ({ branch: call.branch_name }));
    const executor = createGitHubMcpExecutor(invoke);
    const envelope = createOperatorEnvelope({
      id: 'github-mcp-binding-proof',
      operation: 'branch.create',
      repository: 'Zweeback/alicealpha',
      payload: { branch: 'binding-probe', base_ref: 'main' },
    }, () => '2026-09-22T00:00:00.000Z');

    const result = await dispatchOperatorEnvelope(envelope, executor);

    expect(invoke).toHaveBeenCalledOnce();
    expect(invoke).toHaveBeenCalledWith({
      action: 'create_branch',
      repository_full_name: 'Zweeback/alicealpha',
      branch_name: 'binding-probe',
      base_ref: 'main',
    });
    expect(result.completed.status).toBe('succeeded');
    expect(result.completed.detail.result.branch).toBe('binding-probe');
  });
});
