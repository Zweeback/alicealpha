# AI Handover — independent verification of Alice v1

Use this file when handing the project to another AI or reviewer. Do not rely on prior chat narrative.

## Scope

Repository: `Zweeback/alicealpha`

Verified baseline main: `20090568aefb84b618cbef4e362f6dcc788c5cbe`

Active implementation branch: `alice/blindspot-knowledge-kernel-20260926`

PR #73 is intentionally out of v1 and must remain unmerged unless the human operator explicitly changes scope.

## Operator reality

Assume:

- no usable paid OpenAI API dependency,
- no credit-card-dependent requirement,
- OpenAI Realtime is optional,
- browser/local operation is the required baseline,
- merges are human-approved.

Do not "fix" Alice by requiring a new paid provider key.

## Independent reviewer checklist

1. Fetch `main` and the active v1 branch; compare exact SHAs.
2. Verify that each claimed file exists before discussing it.
3. Run/review tests for `runState.js`, `blindspotLedger.js`, `continueAlice.js`, operator dispatch and GitHub executor.
4. Confirm whether `continueAlice` is actually wired to an invocation surface. At reset time it is not.
5. Confirm what process owns the real GitHub write transport. Do not assume ChatGPT's connector exists inside the Render runtime.
6. Verify persistence across the actual target restart/deploy model. A JSON file alone is not proof of durable Render persistence.
7. Treat `OPENAI_API_KEY` as optional. Flag any CI/deploy gate that requires it.
8. Bind CI verification to the exact commit/head being accepted.
9. Verify the known blindspot-ID upsert behavior; do not trust `entries.at(-1)` after updating an existing entry.
10. Require a real v1 acceptance trace: diff -> test/CI evidence -> stored next step -> restart/reload proof.
11. Do not merge high-risk changes without explicit human approval.

## Known current discrepancy

`.github/workflows/live-health.yml` requires `realtimeConfigured:true`, although the documented MVD accepts operation without an OpenAI key. This is a release-gate design discrepancy.

## What must not be silently imported into the audit

Do not treat the following as current alicealpha components unless separately located and cited:

- AURA
- ChromaDB/Qdrant/FAISS RAG bundle
- Codex Hyperloop Python scripts
- SQLite autoloop database
- `state.md` FSM
- `SOUL_MASTER_PROMPT.md`
- `BLINDSPOT_WAFFE.md`
- `TRIBUNAL_KI_VERHALTEN.md`
- Drive/Takeout inventory counts
- live `dortmundgamemap` runtime coupling

They may be valid external project history; they are not established by the current repo tree.

## Review output contract

Return four sections only:

- **Verified**
- **Contradicted**
- **Unproven**
- **Blocking v1**

For every nontrivial statement include the exact file, PR, workflow run, commit SHA or runtime probe used as evidence.

Do not infer root cause from workflow duration alone. Do not call a module "working" merely because its source file exists.
