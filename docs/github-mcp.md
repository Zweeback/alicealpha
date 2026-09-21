# GitHub MCP integration

Alice uses the authenticated ChatGPT GitHub MCP as the execution path for repository work.

## Boundary

The GitHub MCP is an external operator capability available to ChatGPT, not a browser-side Alice credential. Do not embed GitHub tokens or provider credentials in Alice.

## Canonical repository

- Repository: Zweeback/alicealpha
- Default branch: main
- Changes should be made on isolated branches and merged through reviewed/tested pull requests.

## Supported operator loop

1. Inspect repository state through the GitHub MCP.
2. Create an isolated branch.
3. Read and modify repository files through MCP actions.
4. Open a pull request.
5. Run and inspect CI.
6. Merge only after verification.

This replaces the experimental Pianam gateway as the critical repository-control path. Pianam may remain an optional external experiment, but Alice must not depend on it for GitHub operations.

## Security invariant

GitHub authentication stays in the connector boundary. No GitHub access token, cookie, credential, or session material is copied into source code, browser storage, prompts, build artifacts, or deployment variables.
