# Alice local observability — Grafana-free fallback

Status: **implemented in branch only until merged and deployed**. No production access or real-event readback has been claimed.

This is a small REST interface with an in-memory, bounded buffer. There is **no Grafana Cloud dependency**, no database, no collector, no third-party access policy, and no extra npm package.

## Run and inspect on the host

Run Alice normally with `npm run server`. Make a legitimate chat request via the existing `POST /api/chat` route (an available LLM provider must be configured).

On the **same machine** as the backend:

```sh
curl --fail --silent --show-error http://127.0.0.1:8787/api/observability | python3 -m json.tool
```

This returns JSON with `count`, `success`, `error`, `totalDurationMs`, `reportedTokens`, `attemptsWithReportedUsage`, and recent sanitized `events`.

The endpoint is **not** intended as a public dashboard. Socket loopback addresses (`127.0.0.1`, `::1`, `::ffff:127.0.0.1`) are allowed to read without a token. Requests arriving through a reverse proxy or from another machine are denied with HTTP 403 by default. Forwarded headers never grant access.

## Optional protected remote REST access

Only when needed, set a unique randomly generated `ALICE_OBSERVABILITY_READ_TOKEN` of at least 24 characters as a private backend environment variable. Do not place it in Git, frontend code, or chat. To read:

```sh
curl --fail --silent --show-error \
  -H "Authorization: Bearer $ALICE_OBSERVABILITY_READ_TOKEN" \
  https://YOUR-BACKEND-HOST/api/observability
```

Only use HTTPS for remote access. This is a **self-managed read credential**, unrelated to `AGENTO11Y_AUTH_TOKEN`; it is optional for localhost operation.

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
3. Query `http://127.0.0.1:8787/api/observability`; confirm `count > 0` with correct outcome.
4. Query the same endpoint from a non-loopback address without secret; confirm HTTP 403.
5. Only then label it **locally observed**; merged code and passing CI alone do not prove live operation.
