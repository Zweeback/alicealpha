const OPERATIONS = new Set([
  'branch.create',
  'file.create',
  'file.update',
  'pr.create',
  'ci.verify',
  'pr.merge',
]);

function unwrap(result) {
  return result?.result ?? result ?? {};
}

function requireText(value, code) {
  if (typeof value !== 'string' || value.length === 0) throw new Error(code);
  return value;
}

export function createGitHubMcpExecutor(invoke) {
  if (typeof invoke !== 'function') throw new TypeError('github-mcp-invoke-required');

  return async function githubMcpExecutor(request) {
    if (!request || !OPERATIONS.has(request.operation)) {
      throw new Error('github-mcp-operation-not-supported');
    }

    const payload = request.payload || {};

    if (request.operation === 'branch.create') {
      const branch = requireText(payload.branch, 'github-mcp-branch-required');
      const result = unwrap(await invoke({
        action: 'create_branch',
        repository_full_name: request.repository,
        branch_name: branch,
        base_ref: payload.base_ref ?? 'main',
      }));
      return { branch: result.branch ?? branch };
    }

    if (request.operation === 'file.create') {
      const result = unwrap(await invoke({
        action: 'create_file',
        repository_full_name: request.repository,
        path: requireText(payload.path, 'github-mcp-path-required'),
        content: requireText(payload.content, 'github-mcp-content-required'),
        message: requireText(payload.message, 'github-mcp-message-required'),
        branch: payload.branch ?? null,
      }));
      return { commit_sha: result.commit_sha };
    }

    if (request.operation === 'file.update') {
      const result = unwrap(await invoke({
        action: 'update_file',
        repository_full_name: request.repository,
        path: requireText(payload.path, 'github-mcp-path-required'),
        content: requireText(payload.content, 'github-mcp-content-required'),
        message: requireText(payload.message, 'github-mcp-message-required'),
        sha: requireText(payload.sha, 'github-mcp-content-sha-required'),
        branch: payload.branch ?? null,
      }));
      return { commit_sha: result.commit_sha, content_sha: result.content_sha };
    }

    if (request.operation === 'pr.create') {
      const result = unwrap(await invoke({
        action: 'create_pull_request',
        repository_full_name: request.repository,
        title: requireText(payload.title, 'github-mcp-pr-title-required'),
        body: payload.body ?? '',
        head: requireText(payload.head, 'github-mcp-pr-head-required'),
        base: payload.base ?? 'main',
        draft: payload.draft === true,
      }));
      return {
        number: result.number,
        url: result.url ?? result.display_url ?? null,
        head_sha: result.head_sha ?? null,
      };
    }

    if (request.operation === 'ci.verify') {
      const headSha = requireText(payload.head_sha, 'github-mcp-head-sha-required');
      const result = unwrap(await invoke({
        action: 'fetch_commit_workflow_runs',
        repo_full_name: request.repository,
        commit_sha: headSha,
      }));
      const runs = Array.isArray(result.workflow_runs) ? result.workflow_runs : [];
      const success = runs.length > 0
        && runs.every((run) => run.status === 'completed' && run.conclusion === 'success');

      return {
        status: success ? 'success' : 'not-successful',
        head_sha: headSha,
        runs: runs.map((run) => ({
          id: run.id ?? null,
          name: run.name ?? null,
          status: run.status ?? null,
          conclusion: run.conclusion ?? null,
        })),
      };
    }

    if (request.operation === 'pr.merge') {
      const result = unwrap(await invoke({
        action: 'merge_pull_request',
        repository_full_name: request.repository,
        pr_number: payload.pull_number,
        merge_method: payload.merge_method ?? null,
        expected_head_sha: payload.expected_head_sha ?? null,
      }));
      return { merged: result.merged === true, sha: result.sha ?? null, message: result.message ?? null };
    }

    throw new Error('github-mcp-operation-not-supported');
  };
}
