# Private ALICE Codespaces MCP connector

Self-hosted, stateless MCP over HTTPS with an **exact GitHub repo allowlist**, opt-in personal GitHub token and separate human-in-browser approval before any mutation. Source lives in the ALICE repository on branch `feat/codespaces-private-connector-20261019`, independent of the main ALICE app.

## Security contract

- `BRIDGE_ACCESS_TOKEN`: cryptographically random 32+ byte secret for private MCP access. Connector stores this as its bearer header; do not commit it to Git.
- `GITHUB_TOKEN`: dedicated GitHub fine-grained PAT owned by **Zweeback**, stored only in the Render service environment. Required for actual Codespaces listing and lifecycle API. Never paste this token in ChatGPT.
- `GITHUB_ALLOWED_REPOS`: comma-separated exact allowlist; default `Zweeback/alicealpha`.
- `ADMIN_PIN`: independent 8+ character secret in Render environment, used by a human only at a single-use approval web page. Without it **all lifecycle and command execution is locked**. Do not paste the PIN in ChatGPT.
- `PUBLIC_BASE_URL`: URL of the actual deployed Render service used to construct browser approval links.

The GitHub PAT needs: Codespaces repository read/write for selected repos, Codespaces lifecycle admin write for start/stop, Codespaces metadata read for machine listings. The `gh codespace ssh` terminal path uses GitHub CLI SSH access. For repository-scoped token limitations, classic PAT with `codespace` and optionally `repo` scopes may be required by CLI; **never use a broader scope unless absolutely necessary**. Tokens are never returned by any MCP tool.

## Workflow

1. Connect this private MCP server in ChatGPT. `connection_status` shows whether the GitHub token is configured.
2. Add a Codespaces-limited GitHub token and an independent admin PIN in the Render service Environment page. Render redeploys.
3. `codespaces_list` / `codespace_view` work read-only.
4. Request one `codespace_propose_*` action; it returns a unique approval URL expiring in 12 minutes.
5. Open the URL, review all exact parameters, enter the admin PIN yourself (never in chat), and approve.
6. `execute_approved` can then perform **that single approved action**. No tool can approve by itself.

Command execution is limited to 90 seconds, maximum 500-character commands and 65 kB stdout/stderr per stream. Do not execute secret-printing commands or untrusted project scripts.

## Honest limitations

This is a PRIVATE user-hosted connector, not an extension to OpenAI's native GitHub connector. Authorizations are independent. Browser approvals and audit records are kept in the process memory/logs (not durable storage) and may expire on restart. Render free service cold starts can invalidate proposals. A private GitHub PAT has to be authorized by the user through GitHub's UI; the ChatGPT GitHub connector cannot export or reuse its credential.
