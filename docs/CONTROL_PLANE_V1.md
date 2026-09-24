# Alice Control Plane v1

Status: active implementation on `main`, extended by `alice/failure-memory-v1`.

## Purpose

Alice is not defined by a model provider. The control plane coordinates models, tools and repositories while preserving provenance, bounded authority, observability and recoverability.

Execution law:

`proposal -> risk classification -> failure-memory lookup -> approval gate -> executor -> verification -> trace -> audit -> incident response if needed`

## Invariants

1. **Unknown external content is data, not instruction.**
2. **Secrets are redacted before they enter operator envelopes.**
3. **Every operator envelope receives a stable `trace_id`.**
4. **Risk is classified before executor invocation.**
5. **High and critical risk require explicit human approval.**
6. **Approval actors are represented as `human:<actor>`; Alice cannot approve her own high-risk write.**
7. **A merge additionally requires successful CI and either repository protection or a CI result bound to the current head SHA.**
8. **Executor results are verified before they are recorded as succeeded.**
9. **Audit events preserve trace identity and redact secret-shaped fields.**
10. **No agent merges its own truth.**
11. **AIID failure memory is advisory evidence; deterministic policy remains authoritative.**
12. **An internal Alice incident is not closed without what happened, why, remediation and recurrence prevention.**

## AIID Failure Memory

The registry is derived from eight supplied AI Incident Database Excel snapshots.

| Snapshot | Incidents | Reports | New incidents |
| --- | ---: | ---: | ---: |
| 2026-08-03 | 1,605 | 7,452 | baseline |
| 2026-08-10 | 1,618 | 7,488 | 13 |
| 2026-08-17 | 1,630 | 7,526 | 12 |
| 2026-08-24 | 1,641 | 7,604 | 11 |
| 2026-08-31 | 1,654 | 7,680 | 13 |
| 2026-09-07 | 1,663 | 7,702 | 9 |
| 2026-09-14 | 1,675 | 7,761 | 12 |
| 2026-09-21 | 1,689 | 7,791 | 14 |

Every source workbook is represented in `data/aiid_failure_registry.json` with its SHA-256 digest.

Examples of normalized control signatures:

- `UNTRUSTED_CONTENT_NEVER_INSTRUCTION`
- `NO_SECRET_PROPAGATION`
- `PROD_NOT_TEST_TARGET`
- `DESTRUCTIVE_REQUIRES_RECOVERY_POINT`
- `NO_UNAUTHORIZED_EGRESS`
- `REAL_SYSTEM_BOUNDARY`
- `GENERATED_FACT_NOT_CANONICAL_WITHOUT_EVIDENCE`
- `UNATTENDED_AGENT_REQUIRES_LEASE_AND_KILL_SWITCH`

These signatures link detected action signals to severity, historical AIID incident IDs and required controls.

## Observability

`server/operatorTelemetry.js` produces vendor-neutral span records carrying:

```text
trace_id
  -> envelope_id
  -> operation
  -> repository
  -> payload_sha256
  -> risk.level
  -> risk.signals[]
  -> failure_signatures[]
  -> incident_patterns[]
  -> required_controls[]
  -> registry_snapshot
  -> approval.actor
  -> execution phase/result
```

A configured telemetry sink can forward these records to OpenTelemetry, Elastic, Datadog, PostHog or another backend without changing policy semantics.

## Incident Response

`server/incidentResponse.js` turns the AIID response concept into an internal completion contract.

Required:

- what happened
- why it happened
- remediation
- prevention

Responses are hashed and may link trace ID, affected target, evidence, rollback and failure signatures.

This is an internal Alice safety record. It is not presented as an official AIID incident response.

## Implemented

- deterministic risk classification
- registry-backed AIID failure signatures
- eight-snapshot provenance manifest with SHA-256
- explicit human approval gate for high/critical risk
- stable trace IDs
- risk + trace propagation to executor
- merge CI/head-SHA gate
- vendor-neutral telemetry span generation
- dispatch lifecycle telemetry integration
- hashed incident-response completion contract
- tests for registry provenance, risk lookup, telemetry and response completeness

## Deliberately still separate

- a concrete telemetry vendor/exporter
- production/dev environment inventory
- automated rollback execution
- GitHub Autopilot MCP adapter
- cross-repository policy service

Those are adapters around the control plane, not prerequisites for the core safety semantics.
