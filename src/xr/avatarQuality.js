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
  requireField(manifest.promotionGate?.requiresRuntimeDiagnostics === true, 'missing-runtime-diagnostics-gate');
  requireField(manifest.promotionGate?.requiresExplicitVersionBump === true, 'missing-version-bump-gate');
  requireField(manifest.promotionGate?.requiresIdentityReview === true, 'missing-identity-review-gate');
  requireField(manifest.promotionGate?.requiresRigInspection === true, 'missing-rig-inspection-gate');

  if (manifest.canonicalAssetStatus === 'approved') {
    requireField(manifest.approvedAsset?.path, 'approved-missing-asset-path');
    requireField(manifest.approval?.approvedAt, 'approved-missing-timestamp');
    requireField(/^[a-f0-9]{64}$/i.test(manifest.approval?.approvedChecksum || ''), 'approved-missing-checksum');
    requireField(manifest.approval?.approvedBy, 'approved-missing-reviewer');
    requireField(manifest.approval?.status === 'approved', 'approval-status-not-approved');
    requireField(manifest.approvedAsset?.sha256 === manifest.approval?.approvedChecksum, 'approved-checksum-mismatch');
    requireField(!/pending/i.test(manifest.identityRevision || ''), 'approved-identity-revision-still-pending');
    requireField(!/pending/i.test(manifest.sourceReferenceSetRevision || ''), 'approved-reference-revision-still-pending');
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

export function evaluateAvatarPromotion(manifest = {}, candidate = {}, inspection = null) {
  const manifestResult = validateAliceCharacterManifest(manifest);
  const failures = [...manifestResult.failures];
  const warnings = [...manifestResult.warnings];
  const fail = (condition, reason) => {
    if (!condition) failures.push(reason);
  };
  const assetPath = candidate.asset?.path;
  const checksum = candidate.asset?.sha256;
  const nonEmptyString = (value) => typeof value === 'string' && value.trim().length > 0;

  fail(nonEmptyString(assetPath), 'missing-candidate-asset-path');
  fail(/^[a-f0-9]{64}$/i.test(checksum || ''), 'missing-candidate-asset-checksum');
  fail(candidate.quality?.identity === 'verified', 'identity-not-verified');
  fail(nonEmptyString(candidate.identityReview?.visualPassComment), 'missing-visual-identity-review');
  fail(nonEmptyString(candidate.identityReview?.reviewer), 'missing-identity-reviewer');
  fail(nonEmptyString(candidate.identityReview?.reviewedAt), 'missing-identity-review-timestamp');
  fail(candidate.quality?.humanTopology === true, 'non-human-topology');
  fail(candidate.quality?.rigged === true, 'candidate-rig-not-verified');
  fail(candidate.quality?.approved === true, 'candidate-not-approved');
  fail(Boolean(inspection), 'missing-rig-inspection');
  fail(inspection?.asset?.path === assetPath, 'rig-inspection-asset-mismatch');
  fail(Boolean(checksum) && inspection?.asset?.sha256 === checksum, 'rig-inspection-checksum-mismatch');
  fail(inspection?.facialRig?.status === 'available', 'facial-rig-unavailable');
  fail(inspection?.facialRig?.jawAvailable === true, 'jaw-control-unavailable');
  fail(inspection?.facialRig?.missingHumanoidBones?.length === 0, 'missing-humanoid-bones');
  fail(inspection?.facialRig?.missingFacialExpressions?.length === 0, 'missing-facial-expressions');
  fail(inspection?.facialRig?.missingVisemes?.length === 0, 'missing-visemes');
  fail(inspection?.runtimeDiagnostics?.audioEnergyLipSync === 'passed', 'audio-energy-lip-sync-not-validated');
  fail(manifest.approvedAsset?.path === assetPath, 'approved-asset-path-mismatch');
  fail(manifest.approvedAsset?.sha256 === checksum, 'approved-asset-checksum-mismatch');

  return {
    pass: failures.length === 0,
    canPromote: failures.length === 0 && manifestResult.canPromote,
    failures,
    warnings,
  };
}
