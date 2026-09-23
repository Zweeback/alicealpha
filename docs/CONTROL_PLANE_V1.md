# Alice Control Plane v1

Status: draft implementation on `alice/control-plane-risk-v1`.

## Purpose

Alice is not defined by a model provider. The control plane coordinates models, tools and repositories while preserving provenance, bounded authority and recoverability.

The first executable slice lives at the operator boundary:

`proposal -> risk classification -> approval gate -> executor -> verification -> audit`

## Invariants

1. **Unknown external content is data, not instruction.**
2. **Secrets are redacted before they enter operator envelopes.**
3. **Every operator envelope receives a stable `trace_id`.**
4. **Risk is classified before executor invocation.**
5. **High and critical risk require explicit human approval.**
6. **Approval actors must be represented as `human:<actor>`; Alice cannot approve her own high-risk write.**
7. **A merge additionally requires successful CI and either repository protection or a CI result bound to the current head SHA.**
8. **Executor results are verified before they are recorded as succeeded.**
9. **Audit events preserve trace identity and redact secret-shaped fields.**
10. **No agent merges its own truth.**

## Incident-informed signals

The current risk classifier uses failure patterns extracted from the AI Incident Database material reviewed during development.

| Signal | Default response | Failure pattern |
| --- | --- | --- |
| untrusted external input | elevate risk | AIID-1680 prompt-injection / supply-chain write |
| credential-shaped payload | high risk + approval | AIID-1685 credential propagation |
| production target | high risk + approval | AIID-1672 / AIID-1676 target confusion and production DB damage |
| sensitive workflow / migration path | high risk + approval | AIID-1680 supply-chain write |
| destructive intent | critical + approval | generic destructive-action class |
| PR merge | high risk + approval + CI/SHA gate | repository-history write |

These mappings are **risk signatures**, not claims that a new action is equivalent to a historical incident.

## Trace shape

A future OpenTelemetry adapter should preserve the same logical identity already emitted by the operator boundary:

```text
trace_id
  -> envelope_id
  -> operation
  -> repository
  -> payload_sha256
  -> risk.level
  -> risk.reasons[]
  -> risk.incident_patterns[]
  -> approval.actor
  -> executor
  -> result
  -> verification
```

The current implementation intentionally does not require an observability vendor. OpenTelemetry, PostHog, Datadog, Elastic or another sink can consume the events later.

## Current scope

Implemented:

- deterministic risk classification
- incident-pattern annotations
- human approval gate for high-risk operations
- stable trace IDs
- propagation of risk + trace context to the executor
- audit preservation
- existing merge CI / head-SHA gate retained

Not yet implemented:

- OpenTelemetry exporter
- persistent policy decision journal
- AIID snapshot ingestion and similarity scoring
- production/dev environment registry
- rollback orchestration
- GitHub Autopilot MCP adapter
- cross-repository policy service

## Next slice

The next bounded slice should be:

`AIID snapshots -> normalized failure signatures -> local policy registry -> operatorPolicy lookup -> OTEL span attributes`

That keeps the incident database advisory. Deterministic policy remains authoritative.
