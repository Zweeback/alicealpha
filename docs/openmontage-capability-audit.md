# OpenMontage capability audit

Status: experimental, documentation-only. No runtime dependency is added by this probe.

## Why this candidate

OpenMontage is an agent-orchestrated video production system. Its useful architectural ideas for Alice are:

- manifest-driven production stages;
- schema-validated canonical artifacts between stages;
- resumable checkpoints;
- explicit capability/provider discovery;
- preflight cost/budget governance;
- local/open-source provider fallbacks;
- post-render verification.

## Fit against Alice

| Capability | Alice today | OpenMontage pattern | Decision |
| --- | --- | --- | --- |
| Agent orchestration | GitHub MCP operator loop exists | agent is control plane | compatible pattern |
| Video production state | no canonical production contract in AGENTS.md | pipeline manifests + checkpoints | capability gap |
| Artifact validation | operator envelopes are validated | per-stage media artifact schemas | useful extension |
| Cost control | provider credentials stay server-side | preflight cost + provider menu | useful, but must preserve Alice secret boundary |
| Local fallback | required Alice invariant | selector falls back to local/open source | strong fit |
| Full dependency import | not required for proof | Python/Node production stack | defer |

## Smallest integration hypothesis

Do not vendor or install OpenMontage yet.

The smallest useful Alice-native slice is a production contract with these canonical stages:

`idea -> script -> scene_plan -> assets -> edit -> compose -> verify`

Each stage should have one canonical artifact, a checkpoint state, provenance, and an explicit zero-cost/local fallback declaration.

## Guardrails

- Provider credentials remain server-side.
- Generated assets must not contain credentials or session data.
- Any imported provider/tool must declare cost before execution.
- Existing Alice operator audit and fail-closed behavior remain authoritative.
- No external repository code is trusted merely because it is open source.

## Probe result

OpenMontage is not a replacement for Alice's operator loop. Its strongest non-redundant value is a reusable production-state contract for the Ben-and-Bot/video-studio path.
