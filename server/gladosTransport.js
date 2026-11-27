/**
 * Supports Alice-compatible POST/JSON sidecars and the legacy
 * R2D2FISH/glados-tts GET /synthesize/<text> interface.
 */
export function createGladosUpstreamRequest(target, text, { signal } = {}) {
  const url = new URL(target);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('glados-invalid-url-protocol');
  }
  if (!text || typeof text !== 'string') {
    throw new Error('glados-missing-text');
  }

  if (/\/synthesize\/?$/i.test(url.pathname)) {
    const basePath = url.pathname.replace(/\/?$/, '/');
    url.pathname = `${basePath}${encodeURIComponent(text)}`;
    return { url: url.toString(), options: { method: 'GET', signal } };
  }

  return {
    url: url.toString(),
    options: {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text, language: 'en', provider: 'glados' }),
      signal,
    },
  };
}
