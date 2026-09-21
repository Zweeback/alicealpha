const OPERATIONS = new Set(['branch.create']);

export function createGitHubMcpExecutor(invoke) {
  if (typeof invoke !== 'function') throw new TypeError('github-mcp-invoke-required');

  return async function githubMcpExecutor(request) {
    if (!request || !OPERATIONS.has(request.operation)) {
      throw new Error('github-mcp-operation-not-supported');
    }
    if (request.operation === 'branch.create') {
      const branch = request.payload?.branch;
      if (typeof branch !== 'string' || branch.length === 0) {
        throw new Error('github-mcp-branch-required');
      }
      const result = await invoke({
        action: 'create_branch',
        repository_full_name: request.repository,
        branch_name: branch,
        base_ref: request.payload?.base_ref ?? 'main',
      });
      return { branch: result?.branch ?? result?.result?.branch };
    }
  };
}
