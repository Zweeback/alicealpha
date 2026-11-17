# Alice local observability — Grafana-free fallback

Status: **implemented in branch only until merged and deployed**. No production access or real-event readback has been claimed.

This is a small REST interface with an in-memory, bounded buffer. There is **no Grafana Cloud dependency**, no database, no collector, no third-party access policy, and no extra npm package.

## Run and inspect on the host

Run Alice normally with `npm run server`. Make a legitimate chat request via the existing `POST /api/chat` route (an available LLM provider must be configured).

Token-free local reads are **disabled by default**. To use them on the **same machine** as the
backend, start the server with the opt-in flag (developer machines only, never on Render/production):

```sh
ALICE_OBSERVABILITY_ALLOW_LOCAL_UNAUTH=1 npm run server
curl --fail --silent --show-error http://127.0.0.1:8787/api/observability | python3 -m json.tool
```

This returns JSON with `count`, `success`, `error`, `totalDurationMs`, `reportedTokens`, `attemptsWithReportedUsage`, and recent sanitized `events`.

The endpoint is **not** intended as a public dashboard. Access rules:

| Request | `ALICE_OBSERVABILITY_ALLOW_LOCAL_UNAUTH` unset/`0` | `=1` |
| --- | --- | --- |
| Direct loopback socket (`127.0.0.1`, `::1`, `::ffff:127.0.0.1`), no proxy headers | 403 | allowed |
| Loopback socket **with** `X-Forwarded-For`, `Forwarded`, `X-Real-IP` or `CF-Connecting-IP` (any value, even empty) | 403 | 403 |
| Non-loopback socket | 403 | 403 |
| Any of the above with valid `Authorization: Bearer <ALICE_OBSERVABILITY_READ_TOKEN>` | allowed | allowed |

Only the exact value `1` enables the flag (`true`, `yes` etc. do not). A local reverse proxy or
tunnel (nginx, cloudflared, ngrok) connects from loopback but adds proxy headers, so it never
inherits token-free access. Forwarded headers never grant access.

## Optional protected remote REST access

Only when needed, set a unique randomly generated `ALICE_OBSERVABILITY_READ_TOKEN` of at least 24 characters as a private backend environment variable. Do not place it in Git, frontend code, or chat. To read:

```sh
curl --fail --silent --show-error \
  -H "Authorization: Bearer $ALICE_OBSERVABILITY_READ_TOKEN" \
  https://YOUR-BACKEND-HOST/api/observability
```

Only use HTTPS for remote access. This is a **self-managed read credential**, unrelated to `AGENTO11Y_AUTH_TOKEN`; it is the only way to read when `ALICE_OBSERVABILITY_ALLOW_LOCAL_UNAUTH` is not `1`.

## Boundaries

- Only **provider attempts on `POST /api/chat`** are counted, including fallback attempts.
- In-memory **last 250 attempts** by default. Each restart/instance has its own data; data is lost on restart or redeploy. There is no long-term retention, no cross-instance merging, and no proof of frontend client execution.
- Metadata only: provider/model label, outcome, duration, classified error, and provider-reported token counts when available. No chat text, responses, user identifiers, conversation IDs, raw exceptions, keys, or memory.
- Token totals reflect only the bounded in-memory window and only reported usage, **not billing or measured total spend**.
- LSAP and Moonbeam are **not** instrumented by this change.
- For Grafana Cloud Agent Observability ingest, the separate `AGENTO11Y_AUTH_TOKEN` is still required.

## Verification gates

1. Unit tests: `npm run test:run`.
2. With Alice backend running locally, make one accepted provider attempt.
3. With `ALICE_OBSERVABILITY_ALLOW_LOCAL_UNAUTH=1`, query `http://127.0.0.1:8787/api/observability`; confirm `count > 0` with correct outcome. Without the flag the same request must return HTTP 403.
4. Query the same endpoint from a non-loopback address without secret; confirm HTTP 403.
5. Only then label it **locally observed**; merged code and passing CI alone do not prove live operation.
