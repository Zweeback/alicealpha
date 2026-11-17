# Agent Observability — Alice Alpha (Grafana Cloud, EU West 2) and LSAP evidence gate

Status (2026-11-17, branch `observability/grafana-agent-o11y`, not merged, not deployed):

| Gate | Alice Alpha `/api/chat` | LSAP |
| --- | --- | --- |
| DISCOVERED | yes: `server/index.js` → `server/llmRouter.js` | no own implementation found (see below) |
| IMPLEMENTED | yes: generations + OTLP traces, metadata only | no |
| TESTED | unit tests with mocked `fetch` only | no |
| DEPLOYED | **no** (production `alicealpha.onrender.com` runs main without these changes) | no |
| OBSERVED | **no** real generation seen in Grafana yet | no |

## What is instrumented

`POST /api/chat` → `completeLlmChat()` tries the providers of `ALICE_LLM_CHAIN` in order
(default `gemini:gemini-2.5-flash, groq:llama-3.3-70b-versatile, openrouter:google/gemini-2.5-flash:free`;
`openai:gpt-4o-mini` only if put in the chain). Providers without a key are skipped.

Per provider attempt (success **and** failure):

| Signal | Agent Observability generation | OTLP span (`chat <model>`) |
| --- | --- | --- |
| Agent name / version | `agent_name=alice-alpha-chat`, `agent_version` | `gen_ai.agent.name`, root span `gen_ai.agent.version` |
| Provider / model | `model.provider`, `model.name`, `response_model` (provider-reported) | `gen_ai.provider.name`, `gen_ai.request.model`, `gen_ai.response.model` |
| Calls / duration | one generation, `started_at` / `completed_at` | span start/end |
| Errors | `call_error=alice_<class>` (`http_429`, `timeout`, …) | `error.type`, status ERROR |
| Retries / fallback | tags `alice.attempt`, `alice.fallback`; fallback links the failed attempt via `parent_generation_ids` | `alice.attempt`, `alice.fallback` |
| Tokens | `usage` only when the provider reports it | `gen_ai.usage.input_tokens` / `output_tokens` |
| Call chain | `conversation_id` + `trace_id`/`span_id` per request | root span `invoke_agent alice-alpha-chat` with one child per attempt |
| Service status | `GET /api/health` → `agentObservability.{configured,delivery,exportsAccepted,…}` | `agentObservability.otlpTraces.{configured,delivery}` |

**Cost is deliberately not exported.** The repo has no verified price source for the
models used (free tiers / variable OpenRouter routing). Add cost only with a cited price table.

**Never exported:** prompt, reply, system prompt, confirmed memory, persona/companion
state, API keys, raw upstream error text, IP or user identifiers. `response_model` and
`stop_reason` pass a strict allowlist/charset filter. `conversation_id` is a random
per-request UUID, not a user or session identifier.

`delivery=ingest-accepted` in `/api/health` means the ingest API answered `accepted:true`
(process-local counter since last restart). It is **not** proof of Grafana visibility;
OBSERVED requires reading the generation back in Grafana.

## Two separate channels

1. **Agent Observability generations** → `AGENTO11Y_ENDPOINT` + `/api/v1/generations:export`,
   Basic auth `AGENTO11Y_AUTH_TENANT_ID:AGENTO11Y_AUTH_TOKEN` (token scope `sigil:write`).
   Visible in Grafana → Agent Observability → Conversations / Agents.
2. **OTLP traces** → `OTEL_EXPORTER_OTLP_ENDPOINT` + `/v1/traces` (OTLP/HTTP JSON),
   header from `OTEL_EXPORTER_OTLP_HEADERS` (`Authorization=Basic%20<base64(OTLP-instance-id:token)>`,
   token needs `traces:write`). The OTLP instance ID comes from the OpenTelemetry card and
   can differ from the Agent Observability instance ID. Visible in Tempo and in the
   dashboard `grafana/alice-agent-observability.dashboard.json`.

Each channel is off unless all of its variables are set. Exports are fire-and-forget with
a 3 s timeout and never change the `/api/chat` response.

## Setup (backend environment only, needs owner approval)

1. Grafana Cloud → Agent Observability → enable, then Configuration: copy API URL and Instance ID.
2. Create a Cloud Access Policy with `sigil:write` (+ `traces:write` for channel 2) and a token (`glc_…`).
3. On the Render service `alicealpha` set as **secret** env vars:
   `AGENTO11Y_ENDPOINT`, `AGENTO11Y_AUTH_TENANT_ID`, `AGENTO11Y_AUTH_TOKEN`
   (optional `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_EXPORTER_OTLP_HEADERS`).
4. At least one LLM key must be set on Render (`GEMINI_API_KEY`, `GROQ_API_KEY` or
   `OPENROUTER_API_KEY`), otherwise `/api/chat` answers 503 and no generation exists.
   As of 2026-11-17 production `/api/health` reports `chat.operational:false` (no provider key).
5. Merge the PR → Render redeploys main; `Live Deploy Health` checks the exact revision.
6. Send one real chat turn from `https://alicealpha.onrender.com` (origin-checked route).
7. Check `/api/health` → `agentObservability.delivery == "ingest-accepted"`.
8. Grafana → Agent Observability → Conversations: agent `alice-alpha-chat`, provider/model,
   timestamps and tokens must match; no content may appear. Only then: OBSERVED.

Import the dashboard via Dashboards → New → Import, choose the Tempo data source and an
Infinity data source (for the public `/api/health` panel). The dashboard has not been
imported into a real Grafana stack yet.

## LSAP identification gate

Searches on 2026-11-17 (GitHub code/commit/repo search over `Zweeback/*` and `Aintropie/*`,
local box workspace, Notion, Google Drive) found **no own LSAP implementation**:

- GitHub: the only hits for `LSAP` are this document and the PR #150 commit message.
- Google Drive: hits are `scipy/optimize/_lsap.*.pyd` (SciPy's *Linear Sum Assignment
  Problem* solver, third-party, BSD) inside Python package copies — not an agent.
- Notion: no result.

Counter-hypotheses kept open: the name lives in a source not connected here (other
accounts, local disks, chat transcripts), is spelled differently, or refers to a concept,
not code. Absence in search indexes does not prove absence.

Instrument an LSAP only after: (1) source artifact with origin, (2) a running service with a
concrete LLM or tool call, (3) authorization, (4) its own `agent_name`. Never label Alice
telemetry as LSAP or invent LSAP traffic.

References:
- https://grafana.com/docs/grafana-cloud/observe-and-act/agent-observability/reference/generation-ingest-api/
- https://grafana.com/docs/grafana-cloud/observe-and-act/agent-observability/get-started/grafana-cloud/
- https://github.com/grafana/agento11y/blob/main/js/src/exporters/http.ts (proto JSON field names)
