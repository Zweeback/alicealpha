# ALICE · Device/Chat Cloud Bridge (Hobby, 2026-10-22)

## Deployment evidence
- Vercel project: `alice-device-chat-bridge`, Hobby team `derzweeback-5199s-projects`
- Production alias: https://alice-device-chat-bridge.vercel.app
- Deployment ID: `dpl_RbLutC45RushkJX1U7rfaVmrGPBV`
- Deployment state from Vercel API: `READY`
- Project SSO protection: disabled for public health/dashboard; **POST endpoint requires Bearer authentication**.
- External HTTP smoke test: not confirmed (available web fetch and container DNS could not access this new URL).
- Source backed up under `integrations/cloud-bridge/` on branch `alice-android-bridge`.
- No changes made to existing `zweeback-agent-bus`, `alice-os`, or `alice-webrtc` deployments.

## Routes
- `GET /api/health`: public, reports deployed software status and its **limitations**.
- `POST /api/bridge`: private, requires `Authorization: Bearer <ALICE_BRIDGE_TOKEN>` (server-side encrypted Vercel environment variable).
  - `{"action":"handshake","id":"ping-001"}`: validates auth and returns `authenticated`, with retention/execution set to `none`.
  - `{"action":"validate","source":"chat","target":"android","category":"device.intent"}`: validates a bounded envelope and returns `delivered:false,persisted:false`.
- `GET /`: static service status page.

## Safety/limits
- No API keys in public source.
- Requests to private route are authenticated with a timing-safe hash comparison.
- No automatic ChatGPT conversation access; no n8n account connected.
- No Android commands are executed by this service until a device is explicitly paired in a later integration.
- No message history is stored or transmitted to external connectors.
- This is NOT a replacement for the full n8n engine. Its webhook-compatible interface is a development starting point.

## Infrastructure obstacles
- n8n/Railway trial reported expired; not depended on.
- Supabase project `rnhyyigrojmlrbmrjwqt`: ACTIVE_HEALTHY in project inventory, but SQL connection rejected (28P01 Postgres authentication failed). No database edits made.
- Vercel private Blob store creation was rejected with 403 (permission denied). No store created.
- Vercel Hobby usage is free within published quotas; without external storage and client pairing the bridge supports only handshake and validation.

## Next technical milestone
Grant the project access to private storage, then add a durable inbox with authenticated read/write, event-id idempotency, bounded retention, device pairing, and per-connector scopes. Keep user approval for sensitive actions.
