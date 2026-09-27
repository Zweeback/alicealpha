# Alice Web Intake

Alice can capture public web pages as provenance-preserving candidate research artifacts.

## Why this exists

External web content is data, never instruction. Alice must be able to research the live web without allowing arbitrary page text to become trusted memory or executable control-plane input.

The native web-intake path therefore:

1. validates the requested URL;
2. permits only HTTP(S);
3. rejects embedded credentials;
4. rejects localhost, loopback, link-local, private, documentation and other non-public address ranges;
5. re-validates every redirect target;
6. enforces timeout and response-size limits;
7. accepts text/HTML/JSON/XML-family content only;
8. extracts readable text;
9. hashes the original response body;
10. wraps the capture as a `public_web / web_capture` SourceArtifact;
11. marks it `pending`, so it cannot enter Alice context until explicitly approved.

## Runtime configuration

Set a long random bearer token in the server environment:

```bash
ALICE_WEB_INTAKE_TOKEN=...
ALICE_WEB_INTAKE_MAX_BYTES=524288
ALICE_WEB_INTAKE_TIMEOUT_MS=15000
ALICE_WEB_INTAKE_MAX_REDIRECTS=3
```

The token is server-side only and is never exposed through the capability registry.

## API

```http
POST /api/web/intake
Authorization: Bearer <ALICE_WEB_INTAKE_TOKEN>
Content-Type: application/json

{
  "url": "https://example.com/article",
  "purpose": "Research candidate evidence for Alice"
}
```

A successful response contains:

- `capture`: normalized public content + source URL + final URL + content type + byte count + timestamp + SHA-256;
- `artifact`: provenance envelope with `approval: pending`;
- `contextEligible: false`.

The endpoint is intentionally not an open proxy.

## Provider strategy

The native transport is the baseline because it has no external runtime dependency.

Patterns reviewed from current scraping-tool projects:

- **BrightData MCP**: useful as an optional provider for search, structured extraction and remote browser execution. It should sit behind the same Alice intake/provenance contract rather than bypass it.
- **ScrapeWizard**: useful design precedent for deterministic browser workflows, selector fingerprints, sandbox execution and self-healing locators without putting an LLM on the runtime hot path.
- **selector-picker**: useful precedent for stable-selector generation based on IDs, semantic attributes, meaningful classes and structural fallbacks.
- **multi-scraper-mcp**: useful precedent for domain-specific structured tools behind one MCP surface.

Alice does **not** automatically enable CAPTCHA solving, bot-evasion or proxy-rotation behavior in the native transport. Any external provider with those capabilities is a separately configured adapter and remains subject to Alice policy and target-site access rules.

## Next compatible layer

Browser automation can later consume the same SourceArtifact contract:

```text
URL/task
  -> policy
  -> browser provider
  -> DOM/selector evidence
  -> extracted data
  -> SourceArtifact(pending)
  -> explicit approval
  -> Alice context
```

This keeps research, browser automation and future provider adapters compatible with the existing Control Plane v2 invariants.
