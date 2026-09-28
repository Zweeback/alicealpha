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
    expect(result.reason).toBe('asset-missing');
    expect(result.fallback).toBe('procedural');
    expect(summarizeAvatarLoadResult(result)).toContain('status=fallback');
  });

  it('classifies malformed/unsupported payloads and preserves the procedural fallback', async () => {
    const loader = {
      loadAsync: async () => {
        throw new Error('Unexpected token while parsing invalid GLB');
      },
    };

    const result = await loadAvatarCandidate({ selection, loader, inspect: inspectRigged });

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('malformed-or-unsupported');
    expect(result.fallback).toBe('procedural');
  });

  it('rejects a loader result with no scene root as malformed', async () => {
    const loader = { loadAsync: async () => ({ scenes: [], userData: {} }) };
    const result = await loadAvatarCandidate({ selection, loader, inspect: inspectRigged });

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('malformed-or-unsupported');
  });

  it('rejects an unrigged GLB so control contracts stay on the procedural fallback', async () => {
    const model = {};
    const gltf = { scene: model, userData: {} };
    const loader = { loadAsync: async () => gltf };
    const inspectUnrigged = () => ({
      rigged: false,
      blocker: { code: 'unrigged_asset_missing_bones', message: 'no bones' },
    });

    const result = await loadAvatarCandidate({ selection, loader, inspect: inspectUnrigged });

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('unrigged_asset_missing_bones');
    expect(result.fallback).toBe('procedural');
  });

  it('keeps accepted rigged assets on the real-avatar path', async () => {
    const model = {};
    const gltf = { scene: model, userData: {} };
    const loader = { loadAsync: async () => gltf };

    const result = await loadAvatarCandidate({ selection, loader, inspect: inspectRigged });

    expect(result.ok).toBe(true);
    expect(result.model).toBe(model);
    expect(result.fallback).toBe('procedural');
    expect(result.reason).toBeNull();
  });

  it('classifies generic loader failures without pretending they are format errors', () => {
    expect(classifyAvatarLoadFailure(new Error('network reset'))).toBe('load-failed');
  });
});
