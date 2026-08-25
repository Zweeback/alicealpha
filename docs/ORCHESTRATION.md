# Alice orchestration contract

Alice is one coherent persona, not a chat room of competing models. Realtime conversation has one authority. Other systems contribute reviewed artifacts through explicit boundaries and never write directly into the live voice, memory or body-control loop.

## Active runtime

| Layer | Authority | Input | Output |
| --- | --- | --- | --- |
| Conversation | OpenAI Realtime | microphone, confirmed memory, distilled presence | audio, transcript, semantic performance cues |
| Embodiment | local `AliceWorld` | finite gesture/emotion/gaze cues, audio energy, headset pose | face, gaze, gesture, body motion at frame rate |
| Perception | local MediaPipe/WebXR | camera or headset pose | uncertain presence summary; never raw frames to the model |
| Memory | local Tribunal | model proposal plus explicit user decision | hashed `candidate`, `confirmed` or `rejected` record |
| Physical body | Web Serial bridge | validated performance plan | bounded actuator envelope or `safe_hold` |

## Development and knowledge workers

These systems are useful, but they are not Alice's runtime identity.

| System | Intended role | Required handoff |
| --- | --- | --- |
| GitHub | canonical source, pull requests, CI and audit trail | commit SHA, PR and workflow result |
| GitHub Codespaces | reproducible cloud development for Surface/mobile users | repository devcontainer and forwarded preview URL |
| GitHub Copilot | optional implementation/review assistant inside GitHub or Codespaces | diff or review comment tied to a commit |
| Google Jules | asynchronous, repository-scoped coding task | branch/PR; never direct production mutation |
| Gemini | second-opinion research or structured critique | provenance envelope plus source references |
| NotebookLM | synthesis of user-supplied notebooks and source collections | cited brief; no uncited memory writes |
| SuperGrok | exploratory research or adversarial critique | provenance envelope plus verifiable sources |
| Stadt-/Landesbibliothek, DigiBib and connected portals | licensed primary/secondary research | citation, stable identifier, access/license note and excerpt limits |
| ScriptDB | screenplay, dialogue, beat and scene source | script/version identifier, rights note and approved scene packet |

No connector for Copilot, Codespaces, Jules, Gemini, NotebookLM, SuperGrok, DigiBib or ScriptDB is callable in the current Codex session. Their rows are integration contracts, not claims of live access. GitHub is currently connected.

## Provenance envelope

Every external worker must return an artifact with this minimum envelope before Alice may use it:

```json
{
  "artifact_id": "uuid-or-provider-id",
  "kind": "code_review | research_brief | scene_packet | asset_spec",
  "provider": "github | jules | gemini | notebooklm | supergrok | digibib | scriptdb",
  "model_or_collection": "provider-specific identifier",
  "created_at": "ISO-8601",
  "purpose": "bounded task description",
  "sources": ["stable URL, DOI, catalogue or script identifier"],
  "license": "usage and redistribution note",
  "sha256": "content hash",
  "approval": "pending | accepted | rejected"
}
```

Only `accepted` artifacts may enter a build, prompt pack or knowledge index. Even an accepted research artifact does not become personal memory; the Memory Tribunal remains mandatory.

## Routing rules

1. Live speech, interruption, gaze and gesture stay on the low-latency OpenAI Realtime path.
2. Coding tasks start from a GitHub issue and finish as a reviewable branch or PR. Codespaces, Copilot and Jules are interchangeable workers behind that GitHub boundary.
3. Research questions may fan out to Gemini, NotebookLM, SuperGrok and library portals. A synthesizer compares claims and citations; it never chooses by majority vote alone.
4. ScriptDB contributes authored dialogue/scene material. The persona contract filters it for identity, consent, relationship boundaries and physical safety before performance.
5. Failed, unauthenticated or rate-limited workers are isolated. Alice continues with the last confirmed state instead of silently substituting an unlabelled model.

## Next adapters

- add `.devcontainer/devcontainer.json` for Codespaces and document port `8787`
- add a provider-neutral artifact validator for the provenance envelope
- add ScriptDB scene-packet import after its API/connector and rights model are verified
- add a cited research-ingestion queue for NotebookLM/Gemini/SuperGrok/DigiBib outputs
- keep all provider credentials in server-side secret stores; never in browser bundles or Git history

