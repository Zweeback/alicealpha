// Browser side of the Alice Desktop-Gateway (server/desktopGateway.js).
// The browser only proposes and reads state; nothing executes here.
// The proposer credential is passed in per call and must be held in memory
// only by the caller (never localStorage, URL or logs). The desktop-client
// execution token never belongs in the browser.

export const STATE_LABELS = Object.freeze({
  pending: 'wartet auf Desktop-Client',
  delivered: 'liegt dem Menschen am Desktop vor',
  approved: 'am Desktop freigegeben · Ergebnis offen',
  rejected: 'am Desktop abgelehnt',
  succeeded: 'vom Client als ausgeführt gemeldet',
  failed: 'vom Client als nicht ausgeführt gemeldet',
  expired: 'abgelaufen · nicht ausgeführt',
});

export const EVIDENCE_LABELS = Object.freeze({
  asserted: 'Angabe (ungeprüft)',
  observed: 'vom Server geprüft',
  reported: 'vom Client gemeldet',
});

const REASONS = Object.freeze({
  'gateway-disabled': 'auf diesem Server nicht aktiviert',
  'client-token-missing-or-short': 'Client-Kopplung auf dem Server nicht eingerichtet',
  'proposer-token-missing-or-short': 'Vorschlags-Zugang auf dem Server nicht eingerichtet',
  'tokens-must-differ': 'Server-Konfiguration ungültig (Zugänge müssen verschieden sein)',
});

export function gatewayStatusText(status) {
  if (!status) return 'Desktop-Gateway: Status unbekannt';
  if (status.unavailable) return 'Desktop-Gateway auf diesem Host nicht verfügbar';
  if (!status.enabled) return `Desktop-Gateway aus: ${REASONS[status.reason] || 'nicht aktiviert'}`;
  const pairing = status.authenticated ? 'Vorschlagszugang aktiv' : 'nicht angemeldet';
  if (!status.client?.connected) return `Desktop-Client nicht verbunden · ${pairing}`;
  return status.authenticated && status.client.label
    ? `Desktop-Client verbunden: ${status.client.label} · ${pairing}`
    : `Desktop-Client verbunden · ${pairing}`;
}

async function json(response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || `HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return data;
}

export function createDesktopGatewayApi(base = '', fetchImpl = globalThis.fetch?.bind(globalThis)) {
  const root = base.replace(/\/$/, '') + '/api/desktop';
  const auth = (token) => (token ? { authorization: `Bearer ${token}` } : {});
  return {
    async status(token) {
      const response = await fetchImpl(root + '/status', { headers: auth(token), credentials: 'omit' });
      // Static hosts (GitHub Pages, CI preview) have no gateway backend.
      if (response.status === 404 || !String(response.headers?.get?.('content-type') || '').includes('json')) {
        return { unavailable: true, enabled: false, actions: [] };
      }
      return json(response);
    },
    propose: (token, body) => fetchImpl(root + '/proposals', {
      method: 'POST', credentials: 'omit', headers: { 'content-type': 'application/json', ...auth(token) }, body: JSON.stringify(body),
    }).then(json),
    read: (token, id) => fetchImpl(`${root}/proposals/${encodeURIComponent(id)}`, { headers: auth(token), credentials: 'omit' }).then(json),
  };
}
