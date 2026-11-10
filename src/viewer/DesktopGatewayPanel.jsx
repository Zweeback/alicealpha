import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EVIDENCE_LABELS, STATE_LABELS, createDesktopGatewayApi, gatewayStatusText } from '../core/desktopGateway.js';

const FINAL = new Set(['rejected', 'succeeded', 'failed', 'expired']);

export default function DesktopGatewayPanel() {
  const api = useMemo(() => createDesktopGatewayApi(), []);
  // Proposer credential: React memory only. Never localStorage, URL or logs;
  // it is gone after a reload by design.
  const tokenRef = useRef('');
  const [tokenDraft, setTokenDraft] = useState('');
  const [authError, setAuthError] = useState('');
  const [status, setStatus] = useState(null);
  const [statusError, setStatusError] = useState('');
  const [action, setAction] = useState('url.open');
  const [value, setValue] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [items, setItems] = useState([]);

  const refresh = useCallback(async () => {
    try {
      setStatus(await api.status(tokenRef.current));
      setStatusError('');
    } catch (cause) {
      setStatus(null);
      setStatusError('Gateway-Status nicht lesbar: ' + String(cause?.message || cause));
    }
  }, [api]);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 5000);
    return () => clearInterval(timer);
  }, [refresh]);

  useEffect(() => {
    if (!items.some((item) => !FINAL.has(item.state)) || !tokenRef.current) return undefined;
    const timer = setTimeout(async () => {
      const updated = await Promise.all(items.map((item) => (FINAL.has(item.state) ? item : api.read(tokenRef.current, item.id).catch(() => item))));
      setItems(updated);
    }, 2000);
    return () => clearTimeout(timer);
  }, [items, api]);

  async function signIn(event) {
    event.preventDefault();
    setAuthError('');
    const candidate = tokenDraft.trim();
    setTokenDraft('');
    const next = await api.status(candidate).catch(() => null);
    if (next?.authenticated) {
      tokenRef.current = candidate;
      setStatus(next);
    } else {
      setAuthError('Zugang nicht akzeptiert.');
    }
  }

  function signOut() {
    tokenRef.current = '';
    setItems([]);
    refresh();
  }

  async function submit(event) {
    event.preventDefault();
    setError('');
    const params = action === 'url.open' ? { url: value.trim() } : { text: value };
    try {
      const proposal = await api.propose(tokenRef.current, { action, params, reason, source: { kind: 'user', ref: 'vrm-viewer' } });
      setItems((list) => [proposal, ...list].slice(0, 8));
      setValue('');
      setReason('');
    } catch (cause) {
      if (cause?.status === 401) signOut();
      setError(String(cause?.message || cause));
    }
  }

  const authenticated = Boolean(status?.enabled && status?.authenticated);
  if (status?.unavailable) {
    return (
      <section className="vrm-panel" aria-label="Desktop-Gateway">
        <h2>Desktop-Gateway</h2>
        <p className="vrm-helper" aria-live="polite">{gatewayStatusText(status)}</p>
      </section>
    );
  }
  return (
    <section className="vrm-panel" aria-label="Desktop-Gateway">
      <h2>Desktop-Gateway</h2>
      <p className="vrm-helper" aria-live="polite">
        <span className={'vrm-led ' + (authenticated && status?.client?.connected ? 'ok' : 'busy')} /> {statusError || gatewayStatusText(status)}
      </p>
      <p className="vrm-helper">Dieses Gerät schlägt nur vor. Ausgeführt wird erst nach „ja“ am gekoppelten Desktop-Client; Server und Browser führen nichts aus. Für Handy oder Tablet gibt es noch keinen eigenen Client.</p>
      {status?.enabled && !authenticated && (
        <form className="vrm-desktop-form" onSubmit={signIn}>
          <input type="password" autoComplete="off" value={tokenDraft} onChange={(event) => setTokenDraft(event.target.value)}
            placeholder="Vorschlags-Zugang (nur für diese Sitzung)" aria-label="Vorschlags-Zugang" />
          <button type="submit" disabled={!tokenDraft.trim()}>Anmelden</button>
          {authError && <p className="vrm-warning" role="alert">{authError}</p>}
        </form>
      )}
      {authenticated && (
        <form className="vrm-desktop-form" onSubmit={submit}>
          <select value={action} onChange={(event) => setAction(event.target.value)}>
            {(status?.actions || []).map((item) => (
              <option key={item.id} value={item.id}>{item.label}</option>
            ))}
          </select>
          <input value={value} onChange={(event) => setValue(event.target.value)}
            placeholder={action === 'url.open' ? 'https://…' : 'Text'} aria-label="Inhalt der Aktion" />
          <input value={reason} onChange={(event) => setReason(event.target.value)}
            placeholder="Begründung (optional)" aria-label="Begründung" maxLength={280} />
          <button type="submit" disabled={!value.trim()}>Vorschlagen</button>
          <button type="button" onClick={signOut}>Abmelden</button>
        </form>
      )}
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
