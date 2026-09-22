export function evaluateAvatarManifest(manifest = {}) {
  const failures = [];
  const warnings = [];

  if (!manifest.id) failures.push('missing-id');
  if (!manifest.source?.generator) failures.push('missing-generator');
  if (!manifest.source?.reference) failures.push('missing-reference');
  if (!manifest.asset?.path) failures.push('missing-asset-path');
  if (!manifest.asset?.sha256) warnings.push('missing-sha256');

  if (manifest.quality?.identity === 'unknown') warnings.push('identity-unverified');
  if (manifest.quality?.humanTopology === false) failures.push('non-human-topology');
  if (manifest.quality?.rigged === false) warnings.push('not-rigged');
  if (manifest.quality?.approved !== true) warnings.push('not-approved');

  return {
    pass: failures.length === 0,
    failures,
    warnings,
  };
}
