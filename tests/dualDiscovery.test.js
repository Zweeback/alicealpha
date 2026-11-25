import { describe, expect, it, vi } from 'vitest';
import { discoverAlicePublicSources } from '../server/dualDiscovery.js';

describe('Alice public-source discovery: no credentials, no content invention', () => {
  it('reads only the fixed public GitHub tree, ranks matching paths and adds stable links', async () => {
    const fetchFn = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        truncated: false,
        tree: [
          { type: 'blob', path: 'server/alicePrompt.js' },
          { type: 'blob', path: 'docs/ALICE_COOPER_MANIFEST.md' },
          { type: 'blob', path: 'public/alice.vrm' },
          { type: 'blob', path: '.env' },
          { type: 'blob', path: 'node_modules/secret.md' },
          { type: 'tree', path: 'docs' },
          { type: 'blob', path: 'misc/readme.md' },
        ],
      }),
    }));
    const result = await discoverAlicePublicSources({ query: 'COOPER meine Dateien', fetchFn });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, options] = fetchFn.mock.calls[0];
    expect(url).toBe('https://api.github.com/repos/Zweeback/alicealpha/git/trees/main?recursive=1');
    expect(options.method).toBeUndefined();
    expect(JSON.stringify(options)).not.toContain('COOPER meine Dateien');
    expect(result.status).toBe('public-paths-only');
    expect(result.matches.map(m=>m.path)).toEqual([
      'docs/ALICE_COOPER_MANIFEST.md',
      'public/alice.vrm',
      'server/alicePrompt.js',
    ]);
    expect(result.matches[0].url).toContain('github.com/Zweeback/alicealpha/blob/main/');
    expect(JSON.stringify(result)).not.toContain('node_modules/secret');
    expect(result.caveat).toContain('kein Beweis');
  });

  it('fails closed when GitHub is unavailable, rather than inventing files', async () => {
    await expect(discoverAlicePublicSources({
      fetchFn: async () => ({ ok: false, status: 503 }),
    })).rejects.toThrow('github-public-tree-unavailable');
  });

  it('rejects malformed tree data', async () => {
    await expect(discoverAlicePublicSources({
      fetchFn: async () => ({ok:true, json:async()=>({tree:'not-array'})}),
    })).rejects.toThrow('github-public-tree-invalid');
  });
});
