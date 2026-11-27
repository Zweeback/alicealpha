# ALICE Codespaces Bridge – Setup and control policy

## Current verified state (2026-10-19)
- Public Render service: https://alice-codespaces-bridge.onrender.com
- Render dashboard: https://dashboard.render.com/web/srv-dbapcvnbtjjs7382tu90
- Health probe: https://alice-codespaces-bridge.onrender.com/health
- Private plugin: https://chatgpt.com/plugins/plugins_6ad596d31ab48191ab636f63b1ad62c3
- Code: feat/private-codespaces-mcp-20261019 / codespaces-bridge/server.js
- GitHub Actions real MCP smoke: https://github.com/Zweeback/alicealpha/actions/runs/39197829929 (success)
- GitHub authorization: **NOT CONNECTED** (Render env GITHUB_CODESPACES_TOKEN missing)
- Mutations: **DISABLED** (MUTATIONS_ENABLED=false, DELETE_ENABLED=false)
- Direct remote command execution: **UNAVAILABLE** (no SSH agent or explicit consent flow)

## One unavoidable user authorization
1. Open https://github.com/settings/personal-access-tokens/new and create a fine-grained PAT on the intended GitHub account.
2. Limit its repository access to Zweeback/alicealpha. Permissions: Codespaces **Read** for list/view, Codespaces **Write** for create/delete, Codespaces lifecycle admin **Write** for start/stop, Codespaces metadata **Read** for machine types. Select only what is needed now; read-only is a safe first connection.
3. Do **not** paste the token into any chat or GitHub file. Open https://dashboard.render.com/web/srv-dbapcvnbtjjs7382tu90 and add environment variable GITHUB_CODESPACES_TOKEN directly in Render's Environment screen. Save/deploy after setting it.
4. Open the private plugin URL above and connect/enable it in ChatGPT. Then request `codespace_capabilities` and `codespace_list`.

## Allowing future lifecycle actions
- Change MUTATIONS_ENABLED to true in Render only when preparing to authorize a specified action. Creating/starting Codespaces may incur GitHub charges.
- The tool always requires an exact approval phrase (e.g. CREATE Zweeback/alicealpha, START <actual-codespace-name>). In addition, creation requires approve_billing=true, following real user approval.
- Delete is further blocked by DELETE_ENABLED=false unless separately enabled.
- No CodeSpace command execution is offered. It must be developed separately via a user-authorized SSH/agent channel with bounded commands and explicit logging.

## Safety
- MCP requests require the plugin's private gateway key. Key value must never be committed to GitHub.
- The GitHub API token is used server-side only and is not returned by any tool.
- Repository allowlist limits visibility and mutations to Zweeback/alicealpha.
- This cannot reuse the native ChatGPT GitHub connector's token or request its Codespaces OAuth scopes. The native integration requires implementation by its maintainer.
