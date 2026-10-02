# Alice device gateway — bounded webhook contract

This slice establishes an evidence-first control boundary for a later Pixel bridge. It does not claim that a Pixel, ADB, vsock or Android accessibility service is already connected.

## Default state

- `ALICE_DEVICE_COMMAND_SECRET` absent: endpoint is unconfigured and fails closed.
- secret present, `ALICE_DEVICE_EXECUTION` absent: valid commands are authenticated and returned as `dry-run` evidence only.
- execution requires all three: `ALICE_DEVICE_EXECUTION=enabled`, `ALICE_DEVICE_BRIDGE_URL`, and `ALICE_DEVICE_BRIDGE_TOKEN`.

The command secret and bridge token are server-only. They must never be included in browser bundles, URLs, Git or command responses.

## Initial allowlist

- `device_status`
- `home`
- `back`
- `open_app` with a validated Android package name

There is deliberately no arbitrary shell, file access, credential access, tap-coordinate injection, text injection, notification read or screenshot capture in this first slice.

## Signed request

`POST /api/device/command` with `Content-Type: application/json` and `X-Alice-Signature: sha256=<HMAC>`.

The HMAC-SHA256 input is five newline-separated fields: timestamp, nonce, device ID, command, and the key-sorted JSON args object. Timestamps have a 30-second validity window and nonces are single-use inside the replay window.

Every accepted response contains a SHA-256 digest of the canonical command and an ISO timestamp. Execution responses may contain only bounded bridge evidence (`bridge_status` and `evidence_id`), never bridge payloads or secrets.

## Human gate

Physical execution remains disabled until the Pixel 9a bridge proves its transport, Android permission model, command mapping, emergency stop and evidence return on real hardware. Enabling execution or installing a device-side service is a separate human-approved operation.
