# ALICE provenance, rights and financial evidence register

**Research snapshot:** 31 October 2026  
**Scope:** `Zweeback/alicealpha`, the ALICE / Alice Alpha name and assets registered in that repository, and public trademark references found in a preliminary search.  
**Standard:** evidence is separated from assumptions. This is a technical provenance record, not a legal opinion or a complete trademark clearance.

## Executive status

- The FBX-derived GLB and VRM are real, loadable 3D candidates. Browser smoke tests have rendered them in mobile Chromium.
- Neither candidate is approved as canonical ALICE. The repository manifest still says canonical asset pending; identity and animation/deformation checks are not complete.
- The original FBX creator and source licence are not independently established in the repository. The manifest now records that gap explicitly.
- The repository has no declared project licence. Its GitHub metadata reports `license: null`.
- A preliminary public trademark search found other ALICE / Hey Alice filings in software classes. No conclusion about infringement or availability can be drawn without a formal EUIPO/DPMA/TMview clearance.
- No project revenue, payments, invoices, royalties or balances are evidenced in this repository. No external bank or payment account was queried, and no transfer or deposit was made.

## 1. Repository and project identity

| Item | Evidence | Status |
|---|---|---|
| Primary repository | https://github.com/Zweeback/alicealpha | Public repository; default branch `main` |
| GitHub owner | `Zweeback`; commit records use the author name Benjamin Carl | Repository/commit attribution, not proof of trademark ownership |
| Repository created | 20 August 2026, per GitHub repository metadata | Verified repository metadata |
| Public product name in README | “Alice Alpha” | Verified public project wording |
| “Open Alice Project” | Exact phrase not found in the repository code search performed for this review | Not established as a repository brand or registered mark |
| Public preview reference | https://alicealpha.onrender.com | URL appears in README/connector notes; this is a Render-hosted service address, not proof of ownership of a custom domain |
| Custom domain | No custom domain or homepage is declared in repository metadata | Not evidenced |
| Project licence | GitHub repository metadata reports no detected licence (`license: null`); no root LICENSE file was found in the inspected tree | Rights remain reserved unless separately licensed |

The configured GPT name “Open Alice Project” and the repository product name “Alice Alpha” are separate identifiers. A GPT display name does not establish ownership of the repository name, a trademark, or a domain.

## 2. FBX source and derived avatar assets

### Source FBX

- Repository path: `public/avatars/candidates/model.fbx`
- Recorded size: 7,116,336 bytes
- Recorded SHA-256: `da4e5c3bc65b21bdbf9c73c2651df81a645bb315d747c2d9383aa0da025e4c59`
- Git blob SHA on `main`: `accf84261c30260a2e047b621e0bf633a83bba06`
- Main registration commit: https://github.com/Zweeback/alicealpha/commit/54f21e04933b2200fab634176f00dede4a413c92
- That main-branch commit is GitHub-verified. It records the source as an Alice FBX candidate and includes an asset-integrity test.
- PR #97: https://github.com/Zweeback/alicealpha/pull/97
- PR #97 remains **open and unmerged**. Its Jules-authored commit is unsigned and co-authored by Zweeback. The FBX Git blob is identical on `main` and in that open PR. The main-branch registration commit is therefore the evidence for the file's presence on `main`; the open PR must not be described as merged or validated.
- Original creator, original acquisition/source URL, source licence and redistribution rights are not independently verified.

### FBX-derived GLB

- Repository path: `public/avatars/alice-fbx-source.glb`
- Recorded size: 14,605,364 bytes
- Recorded SHA-256 in the asset manifest: `4580ac1c35a8bf4b49ac29d390197dd49cea053de42d563dbe940d09c0adeb30`
- Conversion record: Blender 4.0.2, 14 October 2026, 14:59:07 UTC
- Recorded structure: 8 meshes, 1 armature, 73 bones, 8 weighted meshes, facial shape keys.
- Conversion commit: https://github.com/Zweeback/alicealpha/commit/fa94b757bff8d542ca5d70488930464d7289c3a4
- The asset manifest marks this as a candidate, not an approved canonical asset.

### FBX-derived VRM

- Repository path: `public/avatars/alice-fbx-source.vrm`
- Audit format: VRM 1.0 / glTF 2.0
- Recorded audit: 1 skin, 8 meshes, 54 humanoid bones, 12 preset expressions and 4 custom expressions.
- Recorded output SHA-256: `edce9fb61bbbb35f6c562d65de22cba7bef7350d76186e31f32d267862d26023`
- The audit states that the original GLB payload was preserved.
- The VRM audit still says identity verification, browser animation verification and canonical approval are false.

### Visual proof and limits

A Playwright/Chromium run on 31 October 2026 loaded the FBX-derived GLB into the Three.js viewer. The successful run reported HTTP 200 for the GLB, 8 meshes, 73 bones, no browser errors and produced a screenshot artifact. A separate successful VRM browser run reported VRM 1.0 loaded, 8 meshes, 73 bones, the expression controls and no browser errors.

These tests prove that the files load and render. They do **not** prove identity fidelity, clean deformation under animation, body-animation clips, or final approval. The source conversion record lists no embedded animation actions. The rendered candidate shown in the QA screenshot is a T-pose character in a shirt and jeans; it is not yet verified against the intended towel-Alice reference.

The README describes the target as “towel-Alice” (red hair, blue eyes, white towel, photoreal) and references Grok Imagine concepts. That is a design target reference, not proof that the FBX was created by Grok, by the repository owner, or under a particular licence.

## 3. Names, marks and potential naming conflicts

### Names actually evidenced in the project

- **Alice Alpha** — public repository/product wording.
- **ALICE** — character/project identifier in the manifest and runtime.
- **Alice 3D Viewer / Character Lab** — viewer interface wording.
- **Alice Live Studio v2** — README feature/mode name.
- **GLaDOS** — optional voice mode documented in the repository; it refers to a third-party fictional character/brand and is not evidence of a right held by the project owner.
- **Grok Imagine** — named as a visual-reference source in the README; not evidence of ownership or asset origin.

“Open Alice Project” was not found in the inspected repository. No registration certificate or official trademark record for that exact phrase was found in this preliminary search.

### Preliminary public trademark findings

| Mark / record | Public record found | Relevance and limitation |
|---|---|---|
| **Hey Alice**, EU application 019253342 | Filed by Empathybroker Limited; classes 9 and 42 cover AI software, virtual assistants, voice recognition and AI/SaaS. The UK IPO journal records the corresponding UK filing and priority claim. A secondary EU trademark index reports the EU application opposed. | Potentially relevant to an AI companion/assistant name. “Hey Alice” is not identical to “Open Alice Project”; opposition/status must be checked in the live EUIPO register. |
| **ALICE**, EU application 019428641 | Secondary EU trademark index reports a 28 September 2026 filing by BushelTechAI Solutions Inc., classes 9 and 42, for AI/analytics software in mining and mineral processing; application under examination. | Same word, but a different stated field. This is not evidence of a conflict by itself. |
| **ALICE**, EU application 014758064 | Secondary EU trademark index reports a registration by Fivepals, Inc. for a mobile hotel-services platform. | Shows that the word ALICE is already used in software-related classes; goods/services and current register status matter. |

Sources:
- UK IPO Trade Mark Journal, “Hey Alice”: https://www.ipo.gov.uk/t-tmj/t-tmj/tm-journals/2025-050/UK00004272994.html
- Secondary EU record for Hey Alice: https://www.trademarkelite.com/europe/trademark/trademark-detail/019253342/Hey-Alice
- Secondary EU record for ALICE, 019428641: https://www.trademarkelite.com/europe/trademark/trademark-detail/019428641/ALICE
- Secondary EU record for ALICE, 014758064: https://www.trademarkelite.com/europe/trademark/trademark-detail/014758064/ALICE

These are preliminary search hits, not a complete clearance. A final decision requires live searches in EUIPO/TMview and DPMAregister, including figurative marks, owners, status, oppositions, goods/services and relevant national rights. No statement is made that the project owner owns or may exclusively use ALICE.

## 4. Third-party code, models and brand rights

The repository's `docs/COMPANION_REFERENCE_AUDIT.md` documents architectural references, not automatic permission to reuse their code or assets:

- SpindL is recorded as MIT-licensed.
- Open-LLM-VTuber core code is recorded as MIT; sample/bundled character assets have separate licences.
- AGI-DPA is recorded as MIT.
- VRC_Daemon is explicitly flagged because its licence text contains a commercial-use restriction despite its “MIT License” title.

The repository's `docs/GLADOS_TTS.md` says the R2D2FISH/glados-tts application code is MIT-licensed, but model binaries are distributed separately under their own terms. It explicitly warns that MIT licensing of the adapter does not grant commercial rights to the Portal/GLaDOS character, brand, performance samples or separately distributed model.

The current `package.json` uses React, Three.js, `@pixiv/three-vrm`, Express and MediaPipe. A complete dependency SBOM and per-version licence review has not been completed in this snapshot. No third-party model licence for the original FBX was located.

## 5. Financial evidence

Repository searches for `payment`, `revenue`, `billing`, `invoice`, `donation`, `subscription`, `purchase`, `payout` and `royalty` returned no project records. The only `stripe` text hits were “sock_stripe” in a visual asset-generation script, not a payment integration.

No invoices, contracts, royalty statements, grants, sponsorship receipts, payment records, balances or payout records were found in the inspected repository. The README/connector audit's Render preview reference is a hosting endpoint, not evidence of revenue. No bank, Stripe or other external financial account was queried in this review.

**Result:** no existing project balance, payment or enforceable monetary claim is established by the available repository evidence. This does not prove that no off-repository revenue or claims exist. Those would require separate contracts, invoices, payment-provider records or account statements. No transfer, reservation or deposit was made.

## 6. Evidence gaps and next acceptance gates

1. Identify the original FBX creator and acquisition source; retain the original receipt, export or source URL.
2. Obtain and record the source FBX licence and redistribution/commercial-use permission.
3. Verify the character against the approved Alice reference set; record owner approval and checksum in `ALICE_CHARACTER_MANIFEST.json`.
4. Test skeletal deformation, facial expressions and visemes in browser; record frame evidence and mobile performance. The current conversion lists no embedded body-animation clips.
5. Complete an SBOM/licence review for all runtime dependencies and any bundled models, textures, fonts, voice models and reference images.
6. Perform a live DPMAregister/EUIPO/TMview clearance for “Open Alice Project”, “Alice Alpha”, “ALICE”, logos and relevant classes before commercial use.
7. If money is claimed, attach source documents or read-only records from the relevant payment account; do not infer revenue from a public repository or hosting URL.

**Current decision:** keep the FBX-derived GLB and VRM as opt-in, unapproved candidates. Do not market them as a cleared, canonical Alice asset or claim revenue/rights that are not supported by the evidence above.
