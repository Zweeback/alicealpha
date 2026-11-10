// Browser side of the Alice Desktop-Gateway (server/desktopGateway.js).
// The browser only proposes and reads state; nothing executes here.

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
  asserted: 'Angabe',
  observed: 'vom Server geprüft',
  reported: 'vom Client gemeldet',
});

export function gatewayStatusText(status) {
  if (!status) return 'Desktop-Gateway: Status unbekannt';
  if (!status.enabled) {
    return status.reason === 'client-token-missing-or-short'
      ? 'Desktop-Gateway aus: Kopplungs-Token fehlt auf dem Server'
      : 'Desktop-Gateway aus: auf diesem Server nicht aktiviert';
  }
  if (!status.client?.connected) {
    return status.client?.last_seen_at
      ? `Desktop-Client nicht verbunden (zuletzt ${status.client.last_seen_at})`
      : 'Desktop-Client nicht verbunden';
  }
  return `Desktop-Client verbunden: ${status.client.label}`;
}

async function json(response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
}

export function createDesktopGatewayApi(base = '', fetchImpl = globalThis.fetch?.bind(globalThis)) {
  const root = base.replace(/\/$/, '') + '/api/desktop';
  return {
    status: () => fetchImpl(root + '/status').then(json),
    propose: (body) => fetchImpl(root + '/proposals', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    }).then(json),
    read: (id) => fetchImpl(`${root}/proposals/${encodeURIComponent(id)}`).then(json),
  };
}
