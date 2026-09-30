# MONEY SWARM — Resource Fabric Intake (2026-09-30)

This document folds the large GitHub/MCP/ChatGPT/open-source/money repository dump into the existing Alice/MONEY SWARM architecture.

The rule is **not** “pick one repository and rebuild around it.” Repositories are treated as candidate mechanisms, adapters, patterns, datasets, skill packs, or replaceable workers behind Alice's control plane.

## System invariant

```text
DISCOVER
  -> NORMALIZE
  -> DEDUPLICATE
  -> EXTRACT CAPABILITIES
  -> LICENSE / TOS / SECURITY / REGION CHECK
  -> MAP TO EXISTING SLOT
  -> REUSE BEFORE BUILD
  -> SANDBOX / VERIFY
  -> PACKAGE INTO A REVENUE FACTORY
  -> DISTRIBUTE
  -> MONETIZE
  -> MEASURE
  -> CLONE / MUTATE / KILL
```

Every candidate is scored on:

- time-to-cash
- expected net revenue
- repeatability / recurrence
- automation depth
- user effort
- marginal cost
- legal / ToS / regional fit (Germany / EU where applicable)
- rights / licensing / redistribution constraints
- security and secret exposure
- account / platform dependency
- maintenance burden
- evidence quality
- portability / vendor lock-in
- reuse across multiple revenue streams

No repository becomes trusted code merely because it is popular, recent, tagged `open-source`, or listed in a GitHub topic.

---

## 1. Control plane / orchestration slot

Candidate mechanisms in the supplied dump include:

- LangGraph / LangChain
- Hermes Agent
- OpenHands
- Lobehub
- n8n
- Dify
- Flowise
- Mastra
- AutoGen / AG2
- VoltAgent
- Agenta
- Archestra
- QwenPaw / AgentScope
- CowAgent
- OpenHuman
- Brigade
- Raven
- Golutra
- Headcount
- Langroid
- Swarms
- Rowboat

**Alice mapping:** these are interchangeable orchestration references or workers behind `docs/CONTROL_PLANE_V1.md`, not alternate authorities. Alice keeps one policy boundary, one approval model, one trace/provenance contract, and one verification layer.

Use them to mine:
- durable workflow state
- graph execution
- sub-agent scheduling
- retries / leases / resumability
- capability registries
- human approval gates
- parallel worker semantics
- cost-aware routing
- long-running task patterns

Do not allow any framework to bypass Alice's risk classifier, approval gates, evidence checks, or GitHub audit boundary.

---

## 2. MCP / tool fabric slot

High-signal mechanism families from the supplied dump:

- official GitHub MCP Server
- MCP Python SDK / FastMCP
- mcp-use
- Composio
- Klavis
- ACI.dev
- Activepieces
- Google Workspace MCP
- Playwright MCP
- Chrome DevTools MCP
- Blender MCP
- Context7
- n8n MCP
- WebMCP-style in-page tools
- connector / plugin registries and skill marketplaces

**Alice mapping:** expose tools through a capability registry with:
1. identity,
2. permissions,
3. write/read classification,
4. credential scope,
5. cost model,
6. rate limits,
7. reversible/irreversible flag,
8. evidence contract,
9. health check,
10. fallback.

Old `chatgpt-plugin` repositories are primarily historical implementation/reference material. New work should target the current MCP / connector / app-tool boundary rather than reviving 2023 plugin manifests unless compatibility itself is the product.

---

## 3. Memory / context / knowledge slot

Candidates include:

- mem0
- MemOS
- MemPalace
- Cognee
- Basic Memory
- Airweave
- codebase-memory-mcp
- Graphify
- Graft
- Context Mode
- Repomix / code2prompt
- Obsidian Smart Connections
- llm-wiki-agent / Claude-Obsidian patterns
- Open Brain / personal knowledge layers

**Alice mapping:** split memory into separate stores:

```text
ephemeral task state
confirmed personal memory
project state
codebase graph
document / RAG index
revenue evidence ledger
failure / incident memory
skill / capability registry
```

No external memory framework may collapse these into one untyped vector store. Personal memory remains subject to Alice's existing Tribunal/provenance model.

---

## 4. Discovery / opportunity harvesting slot

Candidates include:

- public-apis / public-api-lists / API-mega-list
- awesome-* repositories and GitHub Collections
- Crawl4AI
- Scrapling
- Agent-Reach
- GPT Researcher
- TrendRadar
- Parallel-style research/search patterns
- GitHub topics: open-source, MCP, ChatGPT, money, agent-skills
- open-source alternative catalogs
- career/job/bounty discovery projects

**Alice mapping:** use these as discovery surfaces feeding a normalized opportunity schema, never as a direct execution feed.

Minimum normalized record:

```json
{
  "source": "...",
  "opportunity_type": "...",
  "mechanism": "...",
  "requirements": [],
  "region": [],
  "estimated_time_to_cash": null,
  "estimated_setup_effort": null,
  "estimated_recurring_effort": null,
  "estimated_gross_value": null,
  "variable_cost": null,
  "platform_dependency": "...",
  "legal_tos_notes": [],
  "evidence": [],
  "confidence": 0.0,
  "next_verified_action": "..."
}
```

---

## 5. Build / productization factory

Strong reusable primitives in the dump:

- Wasp + Open SaaS
- Payload
- Supabase-like BaaS projects
- Webstudio / VvvebJs / page builders
- Twenty / Frappe CRM
- Postiz / Mautic
- Formbricks / OpnForm
- Documenso / Docuseal / OpenSign
- Lago
- Hyperswitch
- Spree / Bagisto / OpenCart
- open-payment-host
- Windmill / Budibase / low-code operations stacks

**Alice mapping:** these are factory components for turning a validated demand signal into:
- micro-SaaS,
- paid hosted tool,
- one-off productized service,
- recurring managed service,
- lead-gen / sales automation package,
- data/report subscription,
- licensed internal tool,
- API/MCP product.

The existing Private Knowledge Agent offer remains one such revenue surface, not the whole MONEY SWARM.

---

## 6. Content / media factory

Candidates include:

- OpenMontage
- Toonflow
- Open Generative AI
- Hyperframes
- html-video
- OpenShorts / AI YouTube Shorts Generator
- YouDub
- CosyVoice
- ChatTTS
- Dograh / voice-agent stacks
- OpenWhispr / OpenLess
- AgentHeroes
- remotion/programmatic-video patterns

**Alice mapping:** one source asset should fan out into multiple monetizable derivatives:

```text
source material
 -> research brief
 -> script
 -> long-form article
 -> short video variants
 -> dubbed/localized versions
 -> audio/podcast variant
 -> visual assets
 -> newsletter/social distribution
 -> downloadable product
 -> API/dataset/knowledge pack where rights allow
```

Every derivative must preserve license, attribution, source provenance, and platform-policy compatibility.

---

## 7. Distribution / CRM / sales factory

Candidate patterns:

- Twenty / Frappe CRM / DeskcommCRM
- Postiz
- Mautic
- WPPConnect and messaging connectors
- campaign / ad operation skills
- Dub / link attribution
- forms, landing pages, scheduling and email tooling

**Alice mapping:**

```text
validated offer
 -> audience definition
 -> lead discovery
 -> qualification
 -> personalized outreach draft
 -> approval where required
 -> send
 -> response classification
 -> follow-up
 -> booking / checkout
 -> attribution
 -> revenue evidence
```

No unsolicited channel automation should be enabled without platform-policy and legal checks.

---

## 8. Yield / finance / “money” mechanisms

The supplied money-topic material adds several distinct mechanism classes:

### A. Direct monetization software
- MoneyPrinter / MoneyPrinterV2
- open-payment-host
- finance/accounting tooling
- e-commerce/payment stacks

### B. Bandwidth / resource sharing
- money4band
- CashFactory
- Hang-up-items style aggregations

These must be treated as **infrastructure-sharing yield**, with explicit checks for:
- ISP contract
- residential-IP reputation
- abuse liability
- account bans
- bandwidth / energy cost
- tax treatment
- payout reliability
- device wear
- exit / uninstall path

### C. Trading / financial automation
- Superalgos
- Vibe-Trading
- FinGPT / FinRobot
- trading-bot libraries

These belong behind a separate **financial-risk gate**. Research, backtesting, paper trading and analytics can be automated; capital deployment or brokerage actions require explicit approval and evidence.

### D. Jobs / bounties / paid tasks
- Career Ops
- open-source internship / funding lists
- GitHub issue/bounty discovery patterns

These feed the existing:
`DISCOVER -> FILTER -> EV-SCORE -> SOLVE -> TEST -> SUBMIT -> CLAIM`
pipeline and can recursively generate reusable tools, MCPs, templates, or products.

---

## 9. Observability / evaluation / proof layer

Candidates include:

- Langfuse
- MLflow
- Opik
- SigNoz
- Helicone
- OpenLLMetry
- Coze Loop
- OpenStatus / Netdata
- agent devtools / session viewers

**Alice mapping:** MONEY SWARM needs economic telemetry, not only LLM traces.

Required measurements:

```text
opportunity_id
agent_minutes
human_minutes
API cost
compute cost
cash cost
gross revenue
net revenue
time_to_first_cash
conversion stage
failure reason
retry count
maintenance burden
evidence quality
reusability count
revenue_per_agent_minute
revenue_per_human_minute
```

Allocator decisions should operate on verified outcomes, not optimistic model estimates.

---

## 10. Security / trust boundary

Useful defensive components in the dump:

- Gitleaks
- Infisical
- LLM Guard
- ClamAV
- secret scanning
- sandbox / Firecracker patterns
- provenance / AI watermark inspection
- vulnerability and dependency tooling

Offensive-security repositories such as autonomous pentest agents, exploitation frameworks, command-injection tools, reverse shells or C2 frameworks are **not** general MONEY SWARM execution components. They may only be referenced inside explicitly authorized defensive/security workflows.

Untrusted repositories run in isolated sandboxes with:
- no production credentials,
- no unrestricted host filesystem,
- no wallet/bank tokens,
- no browser session reuse,
- no outbound access beyond task need,
- time/resource ceilings,
- logged artifacts,
- reproducible teardown.

---

## 11. Search-before-build routing rule

Before Alice writes a new implementation:

1. search the current repo,
2. search the indexed external component catalog,
3. identify candidate mechanism families,
4. inspect license / recency / maintenance / security,
5. extract only the smallest useful component or pattern,
6. benchmark against current implementation,
7. integrate behind an adapter,
8. retain a rollback path.

This turns the huge repository universe into a **component mine**, not a dependency landfill.

---

## 12. Revenue factory graph

```text
                 +--------------------+
                 |  discovery surfaces |
                 +----------+---------+
                            |
                            v
                 +--------------------+
                 | normalize + rights |
                 | + eligibility + EV |
                 +----------+---------+
                            |
             +--------------+--------------+
             |              |              |
             v              v              v
      instant-yield     build-yield    asset-yield
      / bounty          / micro-SaaS   / content-data
             |              |              |
             +--------------+--------------+
                            |
                            v
                 +--------------------+
                 | distribution / CRM |
                 +----------+---------+
                            |
                            v
                 +--------------------+
                 | payment / claim    |
                 +----------+---------+
                            |
                            v
                 +--------------------+
                 | evidence ledger    |
                 +----------+---------+
                            |
                            v
                 +--------------------+
                 | allocator          |
                 | clone/mutate/kill  |
                 +--------------------+
```

---

## Immediate integration consequence

This intake materially expands the component catalog, but it does **not** change the core design:

- Alice remains the persistent control plane.
- GitHub remains canonical for code/evidence.
- external frameworks remain replaceable workers/adapters.
- reversible work can execute directly.
- paid, financial, legally binding, destructive or otherwise irreversible actions remain approval-gated.
- MONEY SWARM optimizes measurable cashflow, not repository count.
- many small verified yield streams are allowed; no single “winner” is required.
- every successful one-off should be tested for conversion into a reusable asset, tool, dataset, MCP, product, subscription, or recurring service.
