import { useCallback, useEffect, useMemo, useState } from 'react';
import { EVIDENCE_LABELS, STATE_LABELS, createDesktopGatewayApi, gatewayStatusText } from '../core/desktopGateway.js';

const FINAL = new Set(['rejected', 'succeeded', 'failed', 'expired']);

export default function DesktopGatewayPanel() {
  const api = useMemo(() => createDesktopGatewayApi(), []);
  const [status, setStatus] = useState(null);
  const [statusError, setStatusError] = useState('');
  const [action, setAction] = useState('url.open');
  const [value, setValue] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [items, setItems] = useState([]);

  const refresh = useCallback(async () => {
    try {
      setStatus(await api.status());
      setStatusError('');
    } catch (cause) {
      setStatus(null);
      setStatusError('Server nicht erreichbar: ' + String(cause?.message || cause));
    }
  }, [api]);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 5000);
    return () => clearInterval(timer);
  }, [refresh]);

  useEffect(() => {
    const open = items.filter((item) => !FINAL.has(item.state));
    if (!open.length) return undefined;
    const timer = setTimeout(async () => {
      const updated = await Promise.all(items.map((item) => (FINAL.has(item.state) ? item : api.read(item.id).catch(() => item))));
      setItems(updated);
    }, 2000);
    return () => clearTimeout(timer);
  }, [items, api]);

  async function submit(event) {
    event.preventDefault();
    setError('');
    const params = action === 'url.open' ? { url: value.trim() } : { text: value };
    try {
      const proposal = await api.propose({ action, params, reason, source: { kind: 'user', ref: 'vrm-viewer' } });
      setItems((list) => [proposal, ...list].slice(0, 8));
      setValue('');
      setReason('');
    } catch (cause) {
      setError(String(cause?.message || cause));
    }
  }

  const enabled = Boolean(status?.enabled);
  return (
    <section className="vrm-panel" aria-label="Desktop-Gateway">
      <h2>Desktop-Gateway</h2>
      <p className="vrm-helper" role="status">
        <span className={'vrm-led ' + (enabled && status?.client?.connected ? 'ok' : 'busy')} /> {statusError || gatewayStatusText(status)}
      </p>
      <p className="vrm-helper">Alice schlägt nur vor. Ausgeführt wird erst nach „ja“ am gekoppelten Desktop-Client; der Server führt nichts aus.</p>
      <form className="vrm-desktop-form" onSubmit={submit}>
        <select value={action} onChange={(event) => setAction(event.target.value)} disabled={!enabled}>
          {(status?.actions || [{ id: 'url.open', label: 'Link öffnen' }]).map((item) => (
            <option key={item.id} value={item.id}>{item.label}</option>
          ))}
        </select>
        <input value={value} onChange={(event) => setValue(event.target.value)} disabled={!enabled}
          placeholder={action === 'url.open' ? 'https://…' : 'Text'} aria-label="Inhalt der Aktion" />
        <input value={reason} onChange={(event) => setReason(event.target.value)} disabled={!enabled}
          placeholder="Begründung (optional)" aria-label="Begründung" maxLength={280} />
        <button type="submit" disabled={!enabled || !value.trim()}>Vorschlagen</button>
      </form>
      {error && <p className="vrm-warning" role="alert">{error}</p>}
      {items.map((item) => (
        <details key={item.id} className="vrm-desktop-item">
          <summary>{item.action} · {STATE_LABELS[item.state] || item.state}</summary>
          <ol>
            {item.journal.map((entry) => (
              <li key={entry.seq}>
                {entry.at} · {entry.event} · {entry.actor} · {EVIDENCE_LABELS[entry.evidence] || entry.evidence}
              </li>
            ))}
          </ol>
          <code>sha256 {item.payload_sha256.slice(0, 16)}…</code>
        </details>
      ))}
    </section>
  );
}
