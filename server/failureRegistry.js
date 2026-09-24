import { readFileSync } from 'node:fs';

const REGISTRY_URL = new URL('../data/aiid_failure_registry.json', import.meta.url);
const REGISTRY = Object.freeze(JSON.parse(readFileSync(REGISTRY_URL, 'utf8')));
const SEVERITY_ORDER = Object.freeze({ low: 0, elevated: 1, high: 2, critical: 3 });

function unique(items) {
  return [...new Set(items)];
}

export function getFailureRegistry() {
  return REGISTRY;
}

export function getFailureRegistryMetadata() {
  return Object.freeze({
    schema_version: REGISTRY.schema_version,
    latest_snapshot: REGISTRY.latest_snapshot,
    latest_counts: Object.freeze({ ...REGISTRY.latest_counts }),
    snapshots: REGISTRY.snapshot_manifest.length,
  });
}

export function matchFailureSignatures(signalTypes = []) {
  const wanted = new Set(signalTypes);
  return REGISTRY.signatures
    .filter((signature) => signature.signals.some((signal) => wanted.has(signal)))
    .map((signature) => Object.freeze({
      id: signature.id,
      severity: signature.severity,
      incident_ids: Object.freeze([...signature.incident_ids]),
      controls: Object.freeze([...signature.controls]),
    }));
}

export function summarizeFailureMatches(signalTypes = []) {
  const matches = matchFailureSignatures(signalTypes);
  let severity = 'low';

  for (const match of matches) {
    if (SEVERITY_ORDER[match.severity] > SEVERITY_ORDER[severity]) severity = match.severity;
  }

  return Object.freeze({
    severity,
    signature_ids: Object.freeze(unique(matches.map((match) => match.id))),
    incident_ids: Object.freeze(unique(matches.flatMap((match) => match.incident_ids))),
    controls: Object.freeze(unique(matches.flatMap((match) => match.controls))),
  });
}
