#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, extname, resolve } from 'node:path';
import { inspectGlbBytes } from './audit_alice_asset.mjs';

const args = process.argv.slice(2);
const value = (name, fallback = null) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
};
const has = (name) => args.includes(name);

const sourceArg = value('--source');
if (!sourceArg) {
  console.error('Usage: node tools/import_studio_asset.mjs --source /path/to/model.glb [--provenance "..."] [--label "..."] [--dry-run]');
  process.exit(2);
}

const source = resolve(sourceArg);
if (!existsSync(source) || !statSync(source).isFile()) {
  console.error('Source asset not found:', source);
  process.exit(2);
}

const ext = extname(source).toLowerCase();
if (!['.glb', '.vrm'].includes(ext)) {
  console.error('Only .glb and .vrm are accepted for Alice runtime import.');
  process.exit(2);
}

const targetName = ext === '.vrm' ? 'alice.vrm' : 'alice.glb';
const target = resolve('public', targetName);
const manifestPath = resolve('public', 'ALICE_CHARACTER_MANIFEST.json');
const provenance = value('--provenance', 'studio handoff; candidate only');
const label = value('--label', basename(source));
const dryRun = has('--dry-run');

const sha256 = (path) => {
  const h = createHash('sha256');
  h.update(readFileSync(path));
  return h.digest('hex');
};

const audit = inspectGlbBytes(readFileSync(source), basename(source));
const checksum = sha256(source);
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const webPath = '/' + targetName;
const kind = ext.slice(1);

const candidate = {
  path: webPath,
  kind,
  status: 'candidate',
  provenance,
  sha256: checksum,
  label,
  importedAt: new Date().toISOString(),
  assetAudit: {
    status: audit.status,
    readyForAnimationReview: audit.readyForAnimationReview,
    triangleCount: audit.triangleCount,
    skinCount: audit.skinCount,
    morphTargetCount: audit.morphTargetCount,
    warnings: audit.warnings,
  },
};

const others = (manifest.candidateAssets || []).filter(
  (item) => item.path !== webPath
);
manifest.candidateAssets = [candidate, ...others];
manifest.canonicalAssetStatus = manifest.approvedAsset ? manifest.canonicalAssetStatus : 'pending';
manifest.notes = Array.from(new Set([
  ...(manifest.notes || []),
  'Studio imports remain candidates and never auto-promote to canonical.',
]));

console.log(JSON.stringify({
  source,
  target,
  sha256: checksum,
  candidate,
  audit,
  dryRun,
}, null, 2));

if (!dryRun) {
  mkdirSync(resolve('public'), { recursive: true });
  copyFileSync(source, target);
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
}
