# Alice Kernel 0.1

This branch adds the smallest durable autonomy loop that can improve without turning generated text into truth.

## Loop

`observe -> diagnose -> retrieve -> plan -> execute -> verify -> remember -> select_next`

The loop is bounded by a step budget and kill switch. A plan may only enter execution when an operator control explicitly allows it. Failed verification blocks the loop. Memory accepts only externally verified evidence.

## Evidence states

`candidate -> verified | rejected -> superseded`

Claims are content-hashed and retain source references, environment and verification evidence. Alice cannot verify her own claims. Secret-shaped payload fields are rejected before hashing.

## Existing boundaries retained

- `operatorPolicy.js` remains the action-risk gate.
- `failureRegistry.js` remains the AIID-informed incident-memory layer.
- `sourceArtifact.js` remains the external-source provenance boundary.
- The hardened private orchestrator remains the owner of leases, artifact verification and process exclusivity.

## Runtime contract

Low-risk analysis and reversible work may be automated. High-impact external writes remain behind the existing human approval policy. The kernel is intentionally a coordinator, not a replacement for the existing safety boundaries.
