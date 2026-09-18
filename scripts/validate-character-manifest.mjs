import fs from 'node:fs';

const SHA256 = /^[a-f0-9]{64}$/i;
const ALLOWED_STATUS = new Set(['pending', 'candidate', 'canonical']);

function nonEmpty(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

export function validateManifest(manifest) {
  const errors = [];

  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    return { ok: false, errors: ['manifest must be an object'] };
  }

  if (!nonEmpty(manifest.schema_version)) errors.push('schema_version is required');
  if (manifest.character_id !== 'alice') errors.push('character_id must equal "alice"');
  if (!nonEmpty(manifest.identity_revision)) errors.push('identity_revision is required');

  const source = manifest.source_reference_set;
  if (!source || !nonEmpty(source.id)) errors.push('source_reference_set.id is required');
  if (!source || !nonEmpty(source.authority)) errors.push('source_reference_set.authority is required');

  const asset = manifest.canonical_asset;
  if (!asset || !ALLOWED_STATUS.has(asset.status)) {
    errors.push('canonical_asset.status must be pending, candidate, or canonical');
  }

  const bones = manifest.rig_contract?.required_humanoid_bones;
  if (!Array.isArray(bones) || bones.length < 10) {
    errors.push('rig_contract.required_humanoid_bones must declare the humanoid rig contract');
  }

  const expressions = manifest.face_contract?.required_expressions;
  for (const name of ['blink', 'jawOpen', 'smile']) {
    if (!Array.isArray(expressions) || !expressions.includes(name)) {
      errors.push(`face_contract.required_expressions must include ${name}`);
    }
  }

  const visemes = manifest.face_contract?.required_visemes;
  for (const name of ['A', 'I', 'U', 'E', 'O']) {
    if (!Array.isArray(visemes) || !visemes.includes(name)) {
      errors.push(`face_contract.required_visemes must include ${name}`);
    }
  }

  if (manifest.fallback_policy?.mode !== 'procedural') {
    errors.push('fallback_policy.mode must remain procedural until a canonical asset is approved');
  }
  if (manifest.fallback_policy?.silent_identity_substitution !== false) {
    errors.push('fallback_policy.silent_identity_substitution must be false');
  }

  if (asset?.status === 'canonical') {
    if (!['glb', 'vrm'].includes(asset.format)) errors.push('canonical asset format must be glb or vrm');
    if (!nonEmpty(asset.path)) errors.push('canonical asset path is required');
    if (!SHA256.test(asset.sha256 || '')) errors.push('canonical asset sha256 must be a 64-character checksum');
    if (!nonEmpty(asset.approved_at)) errors.push('canonical asset approved_at is required');
  } else {
    if (asset?.path || asset?.sha256 || asset?.approved_at) {
      errors.push('non-canonical assets may not populate canonical path/checksum/approval fields');
    }
  }

  return { ok: errors.length === 0, errors };
}

export function validateManifestFile(path = 'public/ALICE_CHARACTER_MANIFEST.json') {
  const manifest = JSON.parse(fs.readFileSync(path, 'utf8'));
  const result = validateManifest(manifest);
  if (!result.ok) {
    throw new Error(result.errors.join('\n'));
  }
  return result;
}

if (process.argv[1] && process.argv[1].endsWith('validate-character-manifest.mjs')) {
  try {
    validateManifestFile(process.argv[2]);
    console.log('Alice character manifest: OK');
  } catch (error) {
    console.error('Alice character manifest: INVALID');
    console.error(error.message);
    process.exitCode = 1;
  }
}
