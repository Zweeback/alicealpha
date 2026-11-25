/**
 * Bounded, read-only provenance discovery in the user's PUBLIC canonical repository.
 * The only outbound request is a fixed GitHub tree URL. User text is never sent
 * to GitHub; it is used locally to rank already public file paths.
 */
const SOURCE = Object.freeze({
  repo: 'Zweeback/alicealpha',
  branch: 'main',
  url: 'https://api.github.com/repos/Zweeback/alicealpha/git/trees/main?recursive=1',
});
const BASE_TERMS = ['alice', 'cooper', 'avatar', 'provenance', 'manifest', 'identity', 'memory', 'shadow'];
const ALLOWED_EXT = /\.(?:js|jsx|ts|tsx|json|jsonl|md|txt|yaml|yml|glb|vrm|csv|pdf)$/i;
const MAX_RESULTS = 24;
const MAX_TREE_ITEMS = 25000;

function keywords(query) {
  const text = String(query || '').toLowerCase();
  const custom = text.match(/[\p{L}\p{N}_-]{4,24}/gu) || [];
  return [...new Set([...BASE_TERMS, ...custom.slice(0, 12)])];
}

export async function discoverAlicePublicSources({
  query = '',
  fetchFn = globalThis.fetch,
  timeoutMs = 10_000,
} = {}) {
  if (typeof fetchFn !== 'function') throw new Error('github-source-fetch-unavailable');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetchFn(SOURCE.url, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'alice-dual-provenance-probe' },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error('github-public-tree-unavailable');
    const payload = await response.json();
    if (!Array.isArray(payload?.tree) || payload.tree.length > MAX_TREE_ITEMS) {
      throw new Error('github-public-tree-invalid');
    }
    const searchTerms = keywords(query);
    const ranked = payload.tree
      .filter((item) => item?.type === 'blob' && typeof item.path === 'string'
        && ALLOWED_EXT.test(item.path) && !/(^|\/)(?:\.env|\.git|node_modules|dist|coverage)(\/|$)/i.test(item.path))
      .map((item) => ({
        path: item.path,
        score: searchTerms.reduce((sum, term) => sum + (item.path.toLowerCase().includes(term) ? 1 : 0), 0),
      }))
      .filter((entry) => entry.score > 0)
      .sort((a,b) => b.score - a.score || a.path.localeCompare(b.path))
      .slice(0, MAX_RESULTS)
      .map(({ path }) => ({
        path,
        url: 'https://github.com/' + SOURCE.repo + '/blob/' + SOURCE.branch + '/'
          + path.split('/').map(encodeURIComponent).join('/'),
      }));
    return {
      status: 'public-paths-only',
      repository: SOURCE.repo,
      source_url: SOURCE.url,
      source_truncated: Boolean(payload.truncated),
      scanned_entries: payload.tree.length,
      matches: ranked,
      caveat: 'Nur öffentlich sichtbare Pfade; kein Beweis für Urheberschaft, Verwertung, externe Kopien oder Eigentum.',
    };
  } finally {
    clearTimeout(timeout);
  }
}
