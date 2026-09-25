# GitHub Resource Intake Map

Purpose: turn scattered GitHub links, stars, trending repos, and historical project repos into one actionable resource map for Alice Alpha.

Status: initial intake map. Do not treat every listed repository as a dependency. Each candidate must solve one concrete Alice problem before adoption.

## Current operating decision

- `Zweeback/alicealpha` = primary Alice body/runtime.
- `Zweeback/Zweeback-orchestrator-private` = execution nerve/system discipline.
- `Zweeback/Mothership` = later hub/connector shell; not the current main workstream.
- External/trending/starred repos = intake candidates only.

## Directly visible Zweeback repositories

| Repository | Current category | Action |
| --- | --- | --- |
| `Zweeback/alicealpha` | `alice-core` | Keep as primary runtime. Run baseline tests/build/server first. |
| `Zweeback/Zweeback-orchestrator-private` | `orchestrator` | Inspect after Alice baseline is green. Use for execution discipline and artifact verification. |
| `Zweeback/Mothership` | `hub-later` | Do not prioritize until concrete connector/hub role exists. |
| `Zweeback/dortmundgamemap` | `3d/world` | Keep separate from Alice unless a shared spatial/runtime interface is needed. |
| `Zweeback/aliceneu` | `legacy` | Do not develop in parallel. Mine useful material only. |
| `Zweeback/tinyrush` | `game/prototype` | Low priority unless reusable runtime patterns exist. |
| `Zweeback/docs` | `docs` | Good target for public coordination docs. |
| `Zweeback/Zweeback-feednoodle` | `feed` | Inspect only if feed ingestion becomes active. |
| `Zweeback/Zweeback-topographie-des-unheimlichen` | `world/lore` | Keep as content/world resource. |
| `Zweeback/Zweeback-dna-matrix` | `bio/visual` | Keep as possible visual/provenance reference. |
| `Zweeback/Zweeback-ddr-sandbox` | `sandbox` | Low priority. |
| `Zweeback/Zweeback-kraken-simulator` | `simulation` | Low priority unless sim patterns are useful. |

## Aintropie / historical project repos

| Repository | Category | Next action |
| --- | --- | --- |
| `Aintropie/rag` | `memory/rag` | Inspect README/structure if accessible. Candidate for Alice resource memory. |
| `Aintropie/RAG_INDEX` | `memory/index` | Inspect for existing recovery/index material. |
| `Aintropie/ISLAND` | `agent-workspace` | Inspect first among Aintropie repos because prior activity suggests real workflow value. |
| `Aintropie/DORTMUND-GTA` | `3d/world` | Inspect if Alice needs spatial/world skills. |
| `Aintropie/feednoodle` | `feed` | Inspect only if feed ingestion is needed. |
| `Aintropie/promptdex` | `prompts` | Candidate for prompt/resource taxonomy. |
| `Aintropie/dna` | `bio/visual` | Candidate for molecular/bio sandbox references. |
| `Aintropie/workspace` | `workspace` | Inspect for project scaffolding. |
| `Aintropie/alice` | `legacy-alice` | Mine only, do not split active development. |
| `Aintropie/bentropie-main` | `unknown` | Low priority until inspected. |
| `Aintropie/Benjamin-Carl-Zwieback-` | `profile/archive` | Low priority until inspected. |

## Trending / pasted candidate repos

| Repository | Category | Relevance | Action |
| --- | --- | --- | --- |
| `paperclipai/paperclip` | `agent-work-management` | High | Inspect for multi-agent work coordination patterns. |
| `anthropics/claude-plugins-official` | `plugin-skills` | High | Inspect for plugin packaging patterns, not runtime dependency. |
| `anthropics/skills` | `agent-skills` | High | Compare skill structure with Alice/AGENTS rules. |
| `obra/superpowers` | `agentic-methodology` | High | Candidate for disciplined dev workflow. |
| `mattpocock/skills` | `agent-skills` | Medium/high | Inspect for practical skill examples. |
| `vectorize-io/hindsight` | `agent-memory` | High | Candidate for memory-learning architecture review. |
| `google/ax` | `agent-orchestration` | Medium/high | Inspect once Alice baseline is green. |
| `androoAGI/starnet` | `local-first-agent-harness` | Medium/high | Inspect as desktop/local harness reference. |
| `dream-num/univer` | `docs/sheets/slides-runtime` | Medium | Useful if Alice needs document-canvas runtime. |
| `pbakaus/impeccable` | `design-language` | Medium | Potential UI/design harness reference. |
| `openbao/openbao` | `secrets` | Medium | Later-stage secrets management, not immediate. |
| `rohitg00/ai-engineering-from-scratch` | `learning/reference` | Low/medium | Reference only. |
| `NVIDIA/Model-Optimizer` | `model-optimization` | Later | Not immediate. |
| `kelseyhightower/kubernetes-the-hard-way` | `infra-learning` | Later | Not immediate. |
| `shy3130/tick-stock-panel` | `finance/quant` | Low | Not Alice-core. |
| `derv82/wifit3` | `caution/security` | Caution | Do not run casually. |

## Shared-link intake already resolved

| Source | Resolved target | Relevance | Decision |
| --- | --- | --- | --- |
| `https://share.google/iClITKQWkkzUmtJsr` | `actuallyrizzn/chatGPT-browser` | High | Use as local reference/tool for ChatGPT export ingestion and conversation-tree analysis. |
| `https://share.google/d7ABz2GjoF00xhuoi` | GitHub topic `chatgpt-chrome-extension` | Medium | Discovery pool only. Do not bulk-clone. |

## `actuallyrizzn/chatGPT-browser` adoption note

Use as:

- local analysis tool for ChatGPT exports;
- reference implementation for full conversation-tree ingestion;
- schema inspiration for Alice resource indexing;
- canonical-thread export source.

Do not use as:

- Alice runtime core;
- direct production dependency without license review;
- blind fork/copypaste target.

Important license note: source code is AGPL-3.0-only; documentation is CC-BY-SA 4.0. Treat this as architectural reference unless compatible obligations are accepted.

Run path:

```bash
git clone https://github.com/actuallyrizzn/chatGPT-browser.git
cd chatGPT-browser
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python init_db.py
python app.py
```

Open:

```text
http://localhost:5000
```

## Triage tags

Use these categories when adding more repos:

- `alice-core`
- `orchestrator`
- `memory`
- `agent-skills`
- `mcp`
- `conversation-browser`
- `export-ingestion`
- `3d`
- `bio/visual`
- `docs`
- `infra`
- `secrets`
- `ui/design`
- `caution`
- `legacy`

## Next concrete actions

1. Run baseline verification from Issue #66: tests, build, server smoke.
2. Inspect `Aintropie/ISLAND` README and file tree.
3. Inspect `Aintropie/rag` and `Aintropie/RAG_INDEX` README/file trees.
4. Build a small importer spec: `ChatGPT export -> canonical SQLite -> URL/repo extraction -> Alice resource candidates`.
5. Only then decide whether to add code to Alice.

## Acceptance check

This file is useful only if it prevents resource sprawl. Any future repo added here needs:

- source URL;
- category;
- concrete Alice problem solved;
- safe next action;
- adopt / reference / ignore decision.
