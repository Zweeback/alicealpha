function messageOf(error) {
  if (typeof error === 'string') return error;
  return error?.message || String(error || 'unknown-error');
}

export function classifyAvatarLoadFailure(error) {
  const status = Number(error?.status || error?.response?.status || 0);
  const message = messageOf(error).toLowerCase();

  if (status === 404 || /\b404\b|not[ -]?found|missing asset/.test(message)) {
    return 'asset-missing';
  }
  if (/unsupported|malformed|parse|invalid glb|invalid gltf|invalid vrm|unexpected token/.test(message)) {
    return 'malformed-or-unsupported';
  }
  return 'load-failed';
}

export async function loadAvatarCandidate({ selection, loader, inspect }) {
  const base = {
    id: selection?.id || 'unknown',
    url: selection?.url || null,
    format: selection?.kind || 'unknown',
    fallback: 'procedural',
  };

  try {
    const gltf = await loader.loadAsync(selection.url);
    const model = gltf?.scene || gltf?.scenes?.[0] || null;
    if (!model) {
      return {
        ...base,
        ok: false,
        mode: 'procedural',
        reason: 'malformed-or-unsupported',
        message: 'Loaded avatar contains no scene root.',
        diagnostics: null,
      };
    }

    const diagnostics = inspect(gltf);
    const mode = gltf?.userData?.vrm
      ? 'vrm'
      : diagnostics?.rigged
        ? 'rigged'
        : 'static-candidate';

    return {
      ...base,
      ok: true,
      mode,
      reason: null,
      message: mode === 'static-candidate'
        ? 'candidate accepted as a static preview; embodiment controls remain unavailable'
        : 'candidate accepted by runtime load boundary',
      diagnostics,
      gltf,
      model,
    };
  } catch (error) {
    return {
      ...base,
      ok: false,
      mode: 'procedural',
      reason: classifyAvatarLoadFailure(error),
      message: messageOf(error),
      diagnostics: null,
    };
  }
}

export function summarizeAvatarLoadResult(result = {}) {
  return [
    `id=${result.id || 'unknown'}`,
    `format=${result.format || 'unknown'}`,
    `status=${result.ok ? 'accepted' : 'fallback'}`,
    `mode=${result.mode || 'procedural'}`,
    `reason=${result.reason || 'none'}`,
    `fallback=${result.fallback || 'procedural'}`,
  ].join(' ');
}
