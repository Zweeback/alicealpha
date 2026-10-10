# LS Symposium — Orchestrierung, Clearance, Bibliotheken, Webforensik
Status: 2026-10-10. This is an evidence-based architecture and live repository state, **not** proof that all providers are authenticated.

## 1. Reproduzierbarer Regelkreis
`User request → LS atomic mission → provenance/acquisition → coding ship → branch/PR → CI & visual QA → human clearance → release → checkpoint/feedback`.

A "self-improving loop" means **versioned, reviewable revisions**, not model self-modification. The ChatGPT model itself cannot be re-aligned, self-extended or made persistent by changing this code.

Existing, actually wired to Alice:
- `lsMissions.js`: bounded, idempotent mission registry, max 24, max 3 retries, one-stage advances only after attributed evidence, local storage.
- `lsCheckpoint.js`: allowlisted state (`stage,view,voice,completedTurns`), 24-hour TTL, no transcripts or secrets.
- `lsCoordinator.js`: per-adapter gate, evidence-based capability snapshot and avatar clearance checks; no inference from subscription ownership.
- `lsForensics.js`: open-case titles, evidence schema and *structural* hard-join candidate classifier; **zero automatically verified claims**.
- `App.jsx`: LS cockpit, mission list and live forensic-case view. This is **not** a cloud-agent executor.
- GitHub PR #112 CI/CD and Render preview are the executed code/test/deploy feedback surfaces.

## 2. Coding ships / official documented contracts
**GitHub Copilot agent**: assign issue to Copilot after agent is enabled, agent creates PR, human reviews/merges.
- Official: https://docs.github.com/en/copilot/how-tos/copilot-on-github/use-copilot-agents/kick-off-a-task
- Ready bounded task: https://github.com/Zweeback/alicealpha/issues/113
- Codespaces: `.devcontainer/devcontainer.json` verified in repo (Node 22, ports 5173/8787, Copilot extensions). A configured container is not evidence of a running Codespace.

**Jules**: GitHub repo must be connected to Jules; first `GET /v1alpha/sources`, inspect actual source name, then `POST /v1alpha/sessions` with `requirePlanApproval: true` and `automationMode: AUTO_CREATE_PR`. API key is held outside GitHub/commit, never in public browser.
- Official https://jules.google/docs/api/reference/
- Official https://jules.google/docs/api/reference/sessions
- No Jules session has been started by this ChatGPT run; no connected Jules adapter credentials in this tool context.

**Claude Cowork / Claude Pro**: Cowork is an independent app and a local/connected-app knowledge-work agent, not equivalent to Anthropic API credits; official https://claude.com/resources/guides/claude-cowork-product-guide/getting-started .
**Gemini**: Google AI subscription is not proof of Cloud API or BigQuery rights; BigQuery deliberately excluded.
**Grok / Grok Bot / Imagine**: separate model/agent/media abilities; subscription does not prove the API endpoint or provisioned credits.
**Colab**: GPU notebook session must be started interactively, no persistent server/GPU guarantee; avoid auto-running expensive jobs.
**ScriptDB**: no identified live database endpoint/secret in this repository. The channel remains not configured.

## 3. Source catalogs, strict scopes and no secret exports
Google Drive user-facing source titles *confirmed via connected Drive search/read*:
- `Alice_Resource_Inventory_CURRENT_2026-09-27` — source-of-truth inventory for declared/wired/tested/deployed capabilities.
- `ALICE_BUILDER.md` — historically recovered Alice builder traces; explicit distinction between drafts and shipped artefacts.
- `L3_CAPABILITY.md` — historical overclaim investigation.
- `ALICE_MAJOR_ORCHESTRA_DASHBOARD.md` — contains claims of operational GPU/Neo4j; **not verified as a currently reachable runtime**.

ChatGPT Library/ChatLake *confirmed via read-only files listing*:
- `/Capability-Frame/AI_CAPABILITY_FRAME_CANON_2026-08-07.md`
- `/Capability-Frame/AI_CAPABILITY_FRAME_CANON_2026-08-07.json`
- `/ChatLake/chatlake_schema.sql`
- `/ChatLake/chatlake_ingest_report.json`
- `/ChatLake/chatlake_staging.sqlite`
The ChatGPT Library is accessible **in this conversation** through scoped Files tools. It is not an automatically credentialed endpoint for the public Alice frontend. No private rows or SQLite bytes published here.

Stadt- und Landesbibliothek Dortmund (not a generic library or BigQuery):
- Public OPAC https://katalog.dortmund.de/aDISWeb/app/opac02
- DigiBib Plus portal linked by the OPAC.
- Licensed documents require authorization; metadata/research references do not establish rights to redistribute.

## 4. Atomic forensic case register
Open cases in `lsForensics.js`:
1. Atlas Earth / Atlas Reality.
2. Atlas AI (distinct identity, DOI and entity verification).
3. Zenodo (public DOI/version/author metadata, not private records).
4. Charming vs Buildy.so vs **separate** Buildly.io.
5. Missing A-in-circle studio art / ChatGPT archives.
6. Beamstream / Manus runtime.
7. ChatGPT Library and original export continuity.
8. Economic rights / any supposed payable.

For each claim: original source URL, captured UTC, original source time, immutable SHA-256 when bytes are available, counter-evidence, explicit access/transfer path, independent cross-check and **human-reviewed decision**. No causal attribution from similar names/logos, no proven payment without a contract/receivable/transaction record. Unknown ≠ false; missing evidence ≠ proof.

Status: **open/inconclusive**, not "proved", not "debunked". Technical code metadata checks cannot certify actual historical truth by themselves.

## 5. Clearance gates
- Avatar: visual identity comparison + provenance + valid facial blendshapes/bones + explicit approval; TRELLIS currently **fails** and must remain user opt-in.
- Agents: code output can be a branch or PR but is never automatically merged solely based on agent prose.
- Financial claims: no payment/revenue amount validated in this flow; possible receivables are unverified until source records are available.
- Expense: do not start billable APIs/Colab jobs without a configured, bounded cost scope.
- Provenance: no private videos, OAuth tokens, documents or identity data committed to public GitHub.

## 6. Two-week priority
- P0: reproducible private-asset source map, rig inspector, identity/clearance test, restore/checkpoint.
- P1: run a single Copilot/Jules coding task via documented account-specific authentication, evidence captured in PR.
- P2: prove read-only cross-source ingestion and case-by-case forensic audit with dedup hashes, no automatically invented joins.
- P3: verify face blendshapes and real TTS energy before claiming hyperreal lip-sync.

**Actual live preview**: https://alice-motoren-lab-20261010.onrender.com
**Review branch**: https://github.com/Zweeback/alicealpha/pull/112

## 7. Verified Charming Metamorphose bridge — 2026-10-10
The existing user-owned **Bentropy Metamorphose** app, https://charm.ing/quick-raven-0017/bentropy-metamorphose, is a separate persistent question ledger, not a GPT model or the published Alice frontend.
- Existing app: schema `meta-loop.v1`, before integration 43 questions, 8 recorded audits.
- Connected through its actual exported `getState`, `previewAudit`, `importBatch` operations; app API acts only on the user's authenticated workspace, no public token embedded here.
- Four **idempotent new questions** imported with source-case closure criteria and read back: `AE-001` Atlas Earth, `AI-001` Atlas AI, `ZD-001` Zenodo, `CB-001` Charming/Buildy/Buildly. No existing question was overwritten.
- Verified readback total: **47**, of which 40 open, 2 working, 3 blocked and 2 closed; 31 currently carry at least one ledger evidence field. `previewAudit` reports no **structural** errors, which is not independent verification of any external claim.
- Existing `AR-002` lost A-circle studio image, `BM-002` Beamstream/Manus, `RV-001` potential income, and `BS-*` ChatGPT archival gaps were reused, not duplicated.
- Alice LS cockpit links to this persistent ledger and displays independent, public GitHub live mission statuses (`src/core/lsLiveFeed.js`) fetched **on demand**. The frontend never embeds a Charming write token.
- Github forensic issue: https://github.com/Zweeback/alicealpha/issues/114
