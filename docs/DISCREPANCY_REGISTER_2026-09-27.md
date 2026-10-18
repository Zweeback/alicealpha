# Discrepancy Register — forensic report vs repository evidence

Status vocabulary:

- **SUPPORTED**: directly supported by current repository/PR/workflow evidence.
- **PARTIAL**: contains a supported core but overstates implementation or causality.
- **UNSUPPORTED-IN-REPO**: no supporting artifact in the verified current repository.
- **CONTRADICTED**: current evidence conflicts with the claim.
- **EXTERNAL/UNKNOWN**: may belong to another archive/repository/system; not established here.

| Claim in forensic narrative | Status | Repository finding |
|---|---|---|
| Alice is a WebXR/companion system with provenance-aware memory | SUPPORTED | React/Three.js/WebXR, memory hashing/confirmation and control-plane files are present. |
| Memory Tribunal requires exact original-source SHA from the model and rejects failure as hallucination/sycophancy | PARTIAL | Current code hashes normalized candidate content and requires explicit confirmation; it does not implement that stronger source-hash tribunal. |
| `AGENTS.md` governs the repo | SUPPORTED | `AGENTS.md` is present. |
| `state.md` is the deterministic FSM/blackboard | UNSUPPORTED-IN-REPO | `state.md` is absent from verified main. |
| D-R-A-S / Critique-then-Commit is implemented as described | UNSUPPORTED-IN-REPO | Not established by current `AGENTS.md` or main tree. |
| `SOUL_MASTER_PROMPT.md` is an authoritative override source | UNSUPPORTED-IN-REPO | File absent from verified main. |
| `codex_auto_loop.py`, `alice_autoloop.py`, `codex.yaml`, SQLite autoloop ledger are alicealpha components | UNSUPPORTED-IN-REPO | No Python files exist in verified main. |
| ChromaDB/Qdrant/FAISS RAG pipeline is implemented in alicealpha | UNSUPPORTED-IN-REPO | No matching implementation/files in verified main. |
| AURA ingestion engine/workers are alicealpha components | UNSUPPORTED-IN-REPO | Named files/components absent from verified main. |
| 445,282 Drive objects / 3.5 TB Takeout / 74,259 messages are repository facts | EXTERNAL/UNKNOWN | These counts are not evidenced by the repository. |
| PR #8 added GLB/VRM loader + procedural fallback | SUPPORTED | Verified merged PR. |
| PR #12 added flat-slice detection/fallback | SUPPORTED | Verified merged PR patch. |
| PR #47 proves approved TRELLIS production avatar | PARTIAL | It added a candidate lab; manifest explicitly had `approved:false`. |
| `dortmundgamemap` is live-coupled to Alice runtime | PARTIAL | A repo link exists; live coupling is not established. |
| Current CI is a complete system-wide collapse | CONTRADICTED | Current main: CI, Container, Live Deploy Health and Release Audit passed; Live Browser WebRTC failed. |
| Short historical job durations prove syntax/import/SQLite/hash/WebGL/STUN causes | UNSUPPORTED-IN-REPO | Durations alone do not prove root cause. Logs must be cited per run. |
| Missing `OPENAI_API_KEY` permanently blocks current live-health workflow | CONTRADICTED / DESIGN BUG | Latest Live Deploy Health passed, but the workflow incorrectly requires `realtimeConfigured:true`. A non-empty key may be stale/nonfunctional. |
| Working OpenAI key is required for Alice core | CONTRADICTED | Server health and documented fallback paths support operation without it. |
| GitHub connector is currently read-only/403 and requires PAT rotation | OUTDATED FOR THIS HOST | This ChatGPT session has performed real writes on the v1 branch. Alice's deployed runtime still lacks a proven self-contained GitHub invocation bridge. |
| `BLINDSPOT_WAFFE.md` and `TRIBUNAL_KI_VERHALTEN.md` are current repo files | UNSUPPORTED-IN-REPO | Both absent from verified main. |
| Personal/medical causal explanations are established by repository evidence | UNSUPPORTED-IN-REPO | A source-code audit cannot establish psychological or medical causality. |

## Primary discrepancy pattern

The forensic narrative repeatedly collapses distinct evidence domains into one:

`chat history / Drive / other repos / conceptual architecture / historical branches / current main / deployed runtime`

These domains must remain separate.

## Required claim discipline

For future audits every capability claim should carry one state:

`DECLARED -> IMPLEMENTED -> WIRED -> TESTED -> DEPLOYED -> VERIFIED`

Never promote a claim to the next state without evidence for that transition.
