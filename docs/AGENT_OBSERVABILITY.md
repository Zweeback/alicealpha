# Agent Observability — Alice Alpha and LSAP evidence gate

Status: **Alice Alpha instrumentation merged into main via PR #150 (2026-11-17); CI tests and browser smoke tests passed; live Grafana ingestion not verified**.
As of 2026-11-17, **LSAP is an unverified project name**, not a confirmed running agent.

## What is instrumented

- Express route: `POST /api/chat`.
- Each configured LLM provider attempt yields one `Generation` (success **and** failure).
- Each attempted call records model/provider, duration via start and end timestamps,
  a **classified** error if present, and only provider-reported token totals when available.
- Prompt, response, system instructions, confirmed memory, agent state, credentials,
  remote exception contents, and user identity are **not exported**.
- The exporter does not affect API/chat response or existing provider fallback.
- `GET /api/health` reports **configured**, not connected or verified.

This sends `Generation` records to the Agent Observability HTTP ingest API.
It **does not** send OpenTelemetry traces/metrics and **does not** instrument
non-LLM agents or processes by itself.

## Setup (backend environment only)

1. In Grafana Cloud's Agent Observability configuration, obtain the API URL and
   numerical Instance ID. These credentials are **not** the OTLP endpoint.
2. Create a scoped Grafana Cloud Access Policy Token with `sigil:write`.
3. Set `AGENTO11Y_ENDPOINT`, `AGENTO11Y_AUTH_TENANT_ID`, and
   `AGENTO11Y_AUTH_TOKEN` as private backend environment variables.
   The SDK-style `AGENTO11Y_PROTOCOL=http` and `AGENTO11Y_AUTH_MODE=basic`
   are documented for compatibility but the built-in exporter directly uses HTTPS and Basic auth.
4. Deploy the backend after tests pass.
5. Make a valid authorized request to `POST /api/chat` with a configured LLM provider.
6. In Grafana's **Conversations**, verify the agent `alice-alpha-chat` and
   compare provider/model, accepted status, timestamps, and observed token counts
   with the local request. No content should appear.
7. Without a successful authenticated export and Grafana readback, status remains
   **unverified**, regardless of the `configured` field in `/api/health`.

Do not place secrets in public .env templates, commits, screenshots, CI logs or
the React client. Never put raw user chat into telemetry simply to populate a dashboard.

## LSAP identification gate

Exact-name searches of the accessible Zweeback GitHub code search, repository-name
search and Google Drive file search on 2026-11-17 did not identify a specific
`LSAP` implementation. This **does not prove absence**, because search indexes
and archives may be incomplete. It also does not establish who built or owns any
similarly named project.

To instrument a separately running LSAP, require first:
1. Source artifact and origin (repository, file path, URL or local artifact hash).
2. Verified executable service and a concrete LLM invocation or tool operation.
3. Authorization to add instrumentation and a verified runtime or CI test.
4. Separate `agent_name`, explicitly labeled `lsap` **only after identification**.

**Do not** label Alice telemetry as LSAP, invent LSAP traffic, or merge their identities.
Once found, reuse the same privacy-safe generation schema or the official Grafana
Agent Observability SDK. Distinguish code instrumentation, accepted export, and
observed Grafana conversation as separate completion gates.

Reference: https://grafana.com/docs/grafana-cloud/observe-and-act/agent-observability/reference/sdks/javascript/
