# BENTROPIE LLMOps-Audit v0

Status: READ-ONLY DEMONSTRATOR. No live provider calls, no production instrumentation, no real savings claim.

## Local execution

node --test tools/tests/llmops_audit.test.mjs

node tools/llmops/audit.mjs tools/llmops/fixtures/demo-traces.jsonl tools/llmops/fixtures/demo-rates.json

The 20 example traces are entirely SIMULATED. Prices are invented arithmetic examples, NOT any provider's actual rates.

Each JSONL record must contain provider, model, input_tokens, output_tokens, latency_ms, and boolean ok. Rates must be explicitly provided in EUR per million input and output tokens, keyed by provider/model. Unpriced records stay UNKNOWN and are never silently counted as free.

Only minimized usage metadata may be provided. Do not include prompts, answers, personal data, API keys or complete provider responses. The auditor does not echo unrecognized input fields. Input is limited to 5 MB and 10,000 records.

The report includes request and error counts, error rate, token counts, p95 latency (nearest-rank), known EUR cost, unknown-price count, and per-model aggregates.

Limits: tokens and timings are caller-supplied, not authenticated against provider invoices; no evaluation of model answer quality, no privacy or EU AI Act certification, no actual API integration. Real usage requires a separately reviewed, server-side, data-minimizing exporter and validated provider price tables.
