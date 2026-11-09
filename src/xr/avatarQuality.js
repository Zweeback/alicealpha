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

export function validateAliceCharacterManifest(manifest = {}) {
  const failures = [];
  const warnings = [];

  const requireField = (condition, failure) => {
    if (!condition) failures.push(failure);
  };

  requireField(manifest.schemaVersion, 'missing-schema-version');
  requireField(manifest.characterId === 'alice', 'invalid-character-id');
  requireField(manifest.identityRevision, 'missing-identity-revision');
  requireField(manifest.sourceReferenceSetRevision, 'missing-source-reference-set-revision');
  requireField(manifest.canonicalAssetStatus, 'missing-canonical-asset-status');
  requireField(Array.isArray(manifest.candidateAssets), 'missing-candidate-assets');
  requireField(Array.isArray(manifest.requiredHumanoidBones), 'missing-required-humanoid-bones');
  requireField(Array.isArray(manifest.requiredFacialExpressions), 'missing-required-facial-expressions');
  requireField(Array.isArray(manifest.requiredVisemes), 'missing-required-visemes');
  requireField(manifest.fallbackPolicy?.proceduralFallbackRequired === true, 'missing-procedural-fallback');
  requireField(manifest.fallbackPolicy?.defaultMayUseCandidateWithoutApproval === false, 'candidate-default-not-fail-closed');
  requireField(manifest.promotionGate?.requiresVisualPassComment === true, 'missing-visual-pass-gate');
  requireField(manifest.promotionGate?.requiresManifestValidation === true, 'missing-manifest-validation-gate');

  if (manifest.canonicalAssetStatus === 'approved') {
    requireField(manifest.approvedAsset?.path, 'approved-missing-asset-path');
    requireField(manifest.approval?.approvedAt, 'approved-missing-timestamp');
    requireField(manifest.approval?.approvedChecksum, 'approved-missing-checksum');
    requireField(manifest.approval?.approvedBy, 'approved-missing-approver');
    requireField(manifest.promotionGate?.requiresRuntimeDiagnostics === true, 'missing-runtime-diagnostics-gate');
    requireField(manifest.promotionGate?.requiresExplicitVersionBump === true, 'missing-version-bump-gate');

    // Promotion must bind to an already registered, SHA-256-identified candidate.
    // A timestamp and an arbitrary checksum alone must never grant approval.
    const approvedPath = manifest.approvedAsset?.path;
    const approvedCandidate = approvedPath && manifest.candidateAssets?.find((item) => item.path === approvedPath);
    requireField(approvedCandidate, 'approved-asset-not-registered-candidate');

    if (approvedCandidate) {
      const candidateSha = approvedCandidate.sha256;
      const approvalSha = manifest.approval?.approvedChecksum;
      requireField(typeof candidateSha === 'string' && /^[a-f0-9]{64}$/i.test(candidateSha), 'approved-candidate-missing-valid-sha256');
      requireField(
        typeof approvalSha === 'string' && /^[a-f0-9]{64}$/i.test(approvalSha)
          && approvalSha.toLowerCase() === candidateSha?.toLowerCase(),
        'approved-checksum-mismatch',
      );
      requireField(approvedCandidate.assetAudit?.identityVerified === true, 'approved-identity-unverified');
      requireField(approvedCandidate.assetAudit?.faceRigRuntimeVerified === true, 'approved-face-runtime-unverified');
    }
  } else {
    if (manifest.approvedAsset) warnings.push('approved-asset-present-before-approval');
    if (manifest.approval?.approvedChecksum) warnings.push('checksum-present-before-approval');
  }

  return {
    pass: failures.length === 0,
    failures,
    warnings,
    canPromote: failures.length === 0 && manifest.canonicalAssetStatus === 'approved',
  };
}
