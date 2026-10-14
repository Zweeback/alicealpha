# Alice provider gateway and evidence boundary

## Existing application, not a replacement

Canonical app: [Zweeback/alicealpha](https://github.com/Zweeback/alicealpha).
Cross-project resource coordination lives in the existing private [Zweeback-orchestrator-private](https://github.com/Zweeback/Zweeback-orchestrator-private). The existing Google Drive inventory stays private in Google Drive and is not replicated into public Alice source control.

Runtime boundaries:
- Browser/3D: Alice voice, WebRTC, gestures, interruptible animation, safety hold.
- Node server: provider-neutral `/api/chat` and optional provider keys.
- Research: `server/sourceArtifact.js` accepts **staged** provenance envelopes. Library, Drive, OpenClaw, Grok and Claude are evidence source labels, **not** live capabilities when named.
- Memory: only user-approved confirmed memories through the existing Tribunal; externally accepted research is not automatically remembered.

## Routes supported by code

The default LLM route remains Gemini, Groq and OpenRouter only when keys and models are configured. It is not silently changed by this update.

Explicit opt-in additional routes:

| Chain prefix | Server credential | Upstream | Payload |
| --- | --- | --- | --- |
| `xai:MODEL_ID` | `XAI_API_KEY` | xAI Chat Completions | OpenAI-compatible conversation |
| `anthropic:MODEL_ID` | `ANTHROPIC_API_KEY` | Anthropic Messages | separate system field, user/assistant messages, version header |

Explicit current model IDs are required; a bare `xai` or `anthropic` chain item is ignored. Other upstreams are skipped when not configured. Unavailable/timeout/429/5xx upstreams use the existing isolation/fallback rules. Successful replies report the provider and model for verifiable provenance.

**No key, no request.** ChatGPT Plus, Claude Pro, Google AI Pro/Drive storage and SuperGrok subscriptions are not developer API access or billing entitlements. No paid API invocations are part of this change.

### Operational configuration

1. Keep the default chain until API entitlements and costs are independently confirmed.
2. Store approved provider keys only as server secrets, never in public files.
3. Add only explicitly approved `provider:model` entries to `ALICE_LLM_CHAIN`.
4. Run `npm run test:run` and `npm run build`; confirm the real server `/api/health` and one explicitly authorized request before reporting a provider as LIVE.

## Multi-source knowledge

Supported artifact source labels now also include `anthropic`, `xai`, `grokbot`, `grok_imagine`, `google_drive`, `google_colab`, `apps_script`, `statista`, and `openclaw`. These are **non-executable source labels**, not API connectors or automatic ingestion.

`mayEnterAliceContext` rechecks a SHA-256 digest against the actual payload and denies modified payloads. This verifies payload integrity relative to the recorded digest. A caller-set `approval: accepted` by itself **does not prove human consent**; the calling workflow remains responsible for authenticating approval before context ingestion.

Licensed Dortmund Stadt- und Landesbibliothek / DigiBib / Statista records remain bounded by the terms and citation of the source. Do not copy membership details, sessions, API credentials or licensed full text into the artifact pipeline.

Official protocol references: [Anthropic Messages](https://platform.claude.com/docs/en/api/messages/create), [xAI Chat Completions](https://docs.x.ai/developers/rest-api-reference/inference/chat-completions).

## Not yet connected

- OpenClaw daemon and authenticated remote gateway: not verified.
- Google Jules task execution, Codespace process, Colab notebook and Apps Script triggers: not verified by this change.
- Pixel Termux ADB: local CLI [PR #121](https://github.com/Zweeback/alicealpha/pull/121), no ChatGPT remote control without separate consented transport.
- Complete 5 TB Drive crawl, paid xAI/Claude/Gemini calls and exact full-file classification: not performed.
