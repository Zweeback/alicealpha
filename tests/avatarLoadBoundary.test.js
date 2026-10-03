import { describe, expect, it } from 'vitest';
import {
  classifyAvatarLoadFailure,
  loadAvatarCandidate,
  summarizeAvatarLoadResult,
} from '../src/xr/avatarLoadBoundary.js';

const selection = { id: 'glb', kind: 'glb', url: '/alice.glb' };
const inspectRigged = () => ({ rigged: true, boneCount: 12, blocker: null });

describe('avatar runtime load boundary', () => {
  it('classifies a missing asset and preserves the procedural fallback', async () => {
    const loader = {
      loadAsync: async () => {
        const error = new Error('404 Not Found');
        error.status = 404;
        throw error;
      },
    };
    const result = await loadAvatarCandidate({ selection, loader, inspect: inspectRigged });
    expect(result.ok).toBe(false);
    expect(result.mode).toBe('procedural');
    expect(result.reason).toBe('asset-missing');
    expect(result.fallback).toBe('procedural');
    expect(summarizeAvatarLoadResult(result)).toContain('status=fallback');
  });

  it('classifies malformed/unsupported payloads and preserves the procedural fallback', async () => {
    const loader = { loadAsync: async () => { throw new Error('Unexpected token while parsing invalid GLB'); } };
    const result = await loadAvatarCandidate({ selection, loader, inspect: inspectRigged });
    expect(result.ok).toBe(false);
    expect(result.mode).toBe('procedural');
    expect(result.reason).toBe('malformed-or-unsupported');
  });

  it('rejects a loader result with no scene root as malformed', async () => {
    const loader = { loadAsync: async () => ({ scenes: [], userData: {} }) };
    const result = await loadAvatarCandidate({ selection, loader, inspect: inspectRigged });
    expect(result.ok).toBe(false);
    expect(result.mode).toBe('procedural');
    expect(result.reason).toBe('malformed-or-unsupported');
  });

  it('keeps a structurally valid unrigged GLB visible as a diagnosed static preview', async () => {
    const model = {};
    const gltf = { scene: model, userData: {} };
    const loader = { loadAsync: async () => gltf };
    const inspectUnrigged = () => ({
      rigged: false,
      blocker: { code: 'unrigged_asset_missing_bones', message: 'no bones' },
    });
    const result = await loadAvatarCandidate({ selection, loader, inspect: inspectUnrigged });
    expect(result.ok).toBe(true);
    expect(result.mode).toBe('static-candidate');
    expect(result.model).toBe(model);
    expect(result.diagnostics.blocker.code).toBe('unrigged_asset_missing_bones');
    expect(summarizeAvatarLoadResult(result)).toContain('mode=static-candidate');
  });

  it('keeps accepted rigged assets on the driven-avatar path', async () => {
    const model = {};
    const gltf = { scene: model, userData: {} };
    const loader = { loadAsync: async () => gltf };
    const result = await loadAvatarCandidate({ selection, loader, inspect: inspectRigged });
    expect(result.ok).toBe(true);
    expect(result.mode).toBe('rigged');
    expect(result.model).toBe(model);
    expect(result.reason).toBeNull();
  });

  it('classifies generic loader failures without pretending they are format errors', () => {
    expect(classifyAvatarLoadFailure(new Error('network reset'))).toBe('load-failed');
  });
});
