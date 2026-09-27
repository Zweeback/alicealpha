import { createHash, timingSafeEqual } from 'node:crypto';
import { lookup as defaultLookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { createSourceArtifact } from './sourceArtifact.js';

const DEFAULT_MAX_BYTES = 512 * 1024;
const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_MAX_REDIRECTS = 3;
const ALLOWED_CONTENT_TYPES = [
  'text/',
  'application/json',
  'application/xml',
  'application/xhtml+xml',
  'application/rss+xml',
  'application/atom+xml',
];

export class WebIntakeError extends Error {
  constructor(code, status = 400) {
    super(code);
    this.name = 'WebIntakeError';
    this.code = code;
    this.status = status;
  }
}

function ipv4Parts(address) {
  const parts = address.split('.').map(Number);
  return parts.length === 4 && parts.every((part) => Number.isInteger(part) && part >= 0 && part <= 255)
    ? parts
    : null;
}

function isBlockedIpv4(address) {
  const parts = ipv4Parts(address);
  if (!parts) return true;
  const [a, b, c] = parts;

  return (
    a === 0
    || a === 10
    || a === 127
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
    || (a === 192 && b === 0 && c === 0)
    || (a === 192 && b === 0 && c === 2)
    || (a === 198 && (b === 18 || b === 19))
    || (a === 198 && b === 51 && c === 100)
    || (a === 203 && b === 0 && c === 113)
    || a >= 224
  );
}

function isBlockedIpv6(address) {
  const normalized = address.toLowerCase().split('%')[0];
  if (normalized === '::' || normalized === '::1') return true;
  if (normalized.startsWith('::ffff:')) {
    const mapped = normalized.slice('::ffff:'.length);
    return isIP(mapped) !== 4 || isBlockedIpv4(mapped);
  }

  const first = Number.parseInt(normalized.split(':')[0] || '0', 16);
  if (!Number.isFinite(first)) return true;

  return (
    normalized.startsWith('fc')
    || normalized.startsWith('fd')
    || /^fe[89ab]/.test(normalized)
    || normalized.startsWith('ff')
    || normalized.startsWith('2001:db8:')
    || first < 0x2000
    || first > 0x3fff
  );
}

export function isPublicAddress(address) {
  const version = isIP(address);
  if (version === 4) return !isBlockedIpv4(address);
  if (version === 6) return !isBlockedIpv6(address);
  return false;
}

export async function validatePublicWebUrl(input, { lookup = defaultLookup } = {}) {
  let url;
  try {
    url = new URL(input);
  } catch {
    throw new WebIntakeError('web-intake-invalid-url', 400);
  }

  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new WebIntakeError('web-intake-protocol-denied', 400);
  }
  if (url.username || url.password) {
    throw new WebIntakeError('web-intake-embedded-credentials-denied', 400);
  }

  const hostname = url.hostname.toLowerCase();
  if (!hostname || hostname === 'localhost' || hostname.endsWith('.localhost')) {
    throw new WebIntakeError('web-intake-private-host-denied', 400);
  }

  if (isIP(hostname)) {
    if (!isPublicAddress(hostname)) {
      throw new WebIntakeError('web-intake-private-address-denied', 400);
    }
    return url;
  }

  let answers;
  try {
    answers = await lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new WebIntakeError('web-intake-dns-failed', 502);
  }

  const records = Array.isArray(answers) ? answers : [answers];
  if (!records.length || records.some((record) => !isPublicAddress(record?.address))) {
    throw new WebIntakeError('web-intake-private-address-denied', 400);
  }

  return url;
}

function decodeEntities(value) {
  const named = {
    amp: '&',
    apos: "'",
    gt: '>',
    lt: '<',
    nbsp: ' ',
    quot: '"',
  };

  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity) => {
    if (entity[0] === '#') {
      const hex = entity[1]?.toLowerCase() === 'x';
      const numeric = Number.parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10);
      return Number.isFinite(numeric) ? String.fromCodePoint(numeric) : match;
    }
    return named[entity.toLowerCase()] ?? match;
  });
}

function normalizeWhitespace(value) {
  return value
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function extractReadableContent(raw, contentType = '') {
  if (!contentType.toLowerCase().includes('html')) {
    return { title: null, text: normalizeWhitespace(raw) };
  }

  const titleMatch = raw.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? normalizeWhitespace(decodeEntities(titleMatch[1].replace(/<[^>]+>/g, ' '))) : null;

  const text = raw
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|template|svg)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<(br|\/p|\/div|\/li|\/section|\/article|\/h[1-6]|\/tr)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');

  return {
    title: title || null,
    text: normalizeWhitespace(decodeEntities(text)),
  };
}

function contentTypeAllowed(value) {
  const normalized = (value || '').toLowerCase();
  return ALLOWED_CONTENT_TYPES.some((prefix) => normalized.startsWith(prefix));
}

async function readLimitedBody(response, maxBytes) {
  const declaredLength = Number(response.headers.get('content-length') || 0);
  if (declaredLength > maxBytes) {
    throw new WebIntakeError('web-intake-response-too-large', 413);
  }

  if (!response.body?.getReader) {
    const body = await response.text();
    const bytes = Buffer.byteLength(body);
    if (bytes > maxBytes) throw new WebIntakeError('web-intake-response-too-large', 413);
    return { body, bytes };
  }

  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      throw new WebIntakeError('web-intake-response-too-large', 413);
    }
    chunks.push(Buffer.from(value));
  }

  return { body: Buffer.concat(chunks).toString('utf8'), bytes: total };
}

export async function fetchPublicWebPage(input, options = {}) {
  const {
    fetchImpl = fetch,
    lookup = defaultLookup,
    now = () => new Date().toISOString(),
    maxBytes = DEFAULT_MAX_BYTES,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    maxRedirects = DEFAULT_MAX_REDIRECTS,
  } = options;

  let current = await validatePublicWebUrl(input, { lookup });
  const sourceUrl = current.toString();

  for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
    let response;
    try {
      response = await fetchImpl(current, {
        method: 'GET',
        redirect: 'manual',
        signal: AbortSignal.timeout(timeoutMs),
        headers: {
          accept: 'text/html, text/plain, application/json, application/xml;q=0.9, */*;q=0.1',
          'user-agent': 'Alice-Web-Intake/0.1',
        },
      });
    } catch (error) {
      if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
        throw new WebIntakeError('web-intake-timeout', 504);
      }
      throw new WebIntakeError('web-intake-fetch-failed', 502);
    }

    if (response.status >= 300 && response.status < 400 && response.headers.get('location')) {
      if (redirectCount >= maxRedirects) {
        throw new WebIntakeError('web-intake-too-many-redirects', 502);
      }
      const next = new URL(response.headers.get('location'), current);
      current = await validatePublicWebUrl(next.toString(), { lookup });
      continue;
    }

    if (!response.ok) {
      throw new WebIntakeError(`web-intake-upstream-${response.status}`, 502);
    }

    const contentType = response.headers.get('content-type')?.split(';')[0]?.trim() || 'application/octet-stream';
    if (!contentTypeAllowed(contentType)) {
      throw new WebIntakeError('web-intake-content-type-denied', 415);
    }

    const { body, bytes } = await readLimitedBody(response, maxBytes);
    const { title, text } = extractReadableContent(body, contentType);

    return Object.freeze({
      source_url: sourceUrl,
      final_url: current.toString(),
      fetched_at: now(),
      status: response.status,
      content_type: contentType,
      bytes,
      title,
      text,
      sha256: createHash('sha256').update(body).digest('hex'),
      trust: 'untrusted-external-data',
      executable_instructions: false,
    });
  }

  throw new WebIntakeError('web-intake-too-many-redirects', 502);
}

export function createWebCaptureArtifact(capture, { purpose } = {}) {
  if (!capture?.sha256 || !capture?.final_url) {
    throw new WebIntakeError('web-intake-capture-invalid', 500);
  }

  return createSourceArtifact({
    artifact_id: `public-web:${capture.sha256.slice(0, 24)}`,
    kind: 'web_capture',
    provider: 'public_web',
    model_or_collection: 'native-http',
    purpose: typeof purpose === 'string' && purpose.trim()
      ? purpose.trim().slice(0, 500)
      : 'Capture a public web source as candidate research context',
    sources: [capture.final_url],
    license: 'Source access terms apply; no reuse rights are inferred by Alice.',
    approval: 'pending',
    payload: capture,
  });
}

export function verifyWebIntakeBearer(authorization, expectedToken) {
  if (typeof expectedToken !== 'string' || !expectedToken) return false;
  if (typeof authorization !== 'string' || !authorization.startsWith('Bearer ')) return false;

  const actual = Buffer.from(authorization.slice('Bearer '.length));
  const expected = Buffer.from(expectedToken);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
