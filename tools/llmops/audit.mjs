/**
 * Local, read-only LLMOps audit for deliberately minimized JSONL traces.
 * No provider calls, prompts, user identifiers, or credentials are logged.
 * Input: provider, model, input_tokens, output_tokens, latency_ms, ok.
 * Prices are never guessed; provide EUR per million tokens explicitly.
 */
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const MAX_BYTES = 5_000_000;
const MAX_RECORDS = 10_000;
const SAFE_NAME = /^[a-z0-9][a-z0-9._:-]{0,79}$/i;
const isCount = value => Number.isSafeInteger(value) && value >= 0;
const isAmount = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const round = (value, decimals = 6) => Number(value.toFixed(decimals));

export function analyzeTraces(jsonl, rates = {}) {
  if (typeof jsonl !== 'string' || Buffer.byteLength(jsonl, 'utf8') > MAX_BYTES) throw new Error('trace input invalid or exceeds 5 MB');
  if (!rates || typeof rates !== 'object' || Array.isArray(rates)) throw new Error('rates must be an object');
  const lines = jsonl.split(/\r?\n/).filter(line => line.trim());
  if (lines.length > MAX_RECORDS) throw new Error('trace input exceeds 10000 records');
  const totals = { requests: 0, failures: 0, input_tokens: 0, output_tokens: 0, known_cost_eur: null, unpriced_requests: 0 };
  let knownCost = 0;
  let priced = 0;
  const latencies = [];
  const byModel = new Map();

  for (const [index, line] of lines.entries()) {
    const location = 'invalid record at line ' + (index + 1);
    let row;
    try { row = JSON.parse(line); } catch { throw new Error(location); }
    if (!row || typeof row !== 'object' || Array.isArray(row)
      || !SAFE_NAME.test(row.provider) || !SAFE_NAME.test(row.model)
      || !isCount(row.input_tokens) || !isCount(row.output_tokens)
      || !isAmount(row.latency_ms) || typeof row.ok !== 'boolean') throw new Error(location);

    const key = row.provider + '/' + row.model;
    const bucket = byModel.get(key) || { provider: row.provider, model: row.model, requests: 0, failures: 0, input_tokens: 0, output_tokens: 0, known_cost_eur: null, unpriced_requests: 0 };
    bucket.requests++;
    totals.requests++;
    if (!row.ok) { bucket.failures++; totals.failures++; }
    totals.input_tokens += row.input_tokens;
    totals.output_tokens += row.output_tokens;
    bucket.input_tokens += row.input_tokens;
    bucket.output_tokens += row.output_tokens;
    latencies.push(row.latency_ms);

    const rate = Object.hasOwn(rates, key) ? rates[key] : null;
    if (rate === null || rate === undefined) {
      totals.unpriced_requests++;
      bucket.unpriced_requests++;
    } else {
      if (typeof rate !== 'object' || !isAmount(rate.input_per_million_eur) || !isAmount(rate.output_per_million_eur)) {
        throw new Error('invalid rate for ' + key);
      }
      const cost = (row.input_tokens * rate.input_per_million_eur + row.output_tokens * rate.output_per_million_eur) / 1_000_000;
      knownCost += cost;
      bucket.known_cost_eur = (bucket.known_cost_eur ?? 0) + cost;
      priced++;
    }
    byModel.set(key, bucket);
  }

  latencies.sort((a, b) => a - b);
  return {
    schema: 'bentropie-llmops-audit-v0',
    source: 'caller-supplied-minimized-traces',
    ...totals,
    error_rate: totals.requests ? round(totals.failures / totals.requests) : null,
    latency_p95_ms: latencies.length ? latencies[Math.ceil(latencies.length * 0.95) - 1] : null,
    known_cost_eur: priced ? round(knownCost) : null,
    cost_is_complete: totals.requests > 0 && totals.unpriced_requests === 0,
    by_model: [...byModel.values()].sort((a,b) => (a.provider + a.model).localeCompare(b.provider + b.model)).map(row => ({
      ...row,
      known_cost_eur: row.known_cost_eur === null ? null : round(row.known_cost_eur)
    })),
    note: 'Missing prices are UNKNOWN, not zero. No baseline savings or payouts implied.'
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [tracesPath, ratesPath] = process.argv.slice(2);
  if (!tracesPath) {
    console.error('Usage: node tools/llmops/audit.mjs traces.jsonl [rates.json]');
    process.exitCode = 2;
  } else {
    try {
      const traces = readFileSync(tracesPath, 'utf8');
      const rates = ratesPath ? JSON.parse(readFileSync(ratesPath, 'utf8')) : {};
      console.log(JSON.stringify(analyzeTraces(traces, rates), null, 2));
    } catch (error) {
      console.error('Audit failed: ' + error.message.replace(/[\r\n]/g, ' '));
      process.exitCode = 1;
    }
  }
}
