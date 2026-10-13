// Browser-local, opt-in UI observability. Never records text, input values, cookies or tokens.
const DEFAULT_LIMIT = 300;

// Only active during an explicitly started local capture session.
let activeTraceReceiver = null;

export function beginAliceBackendTrace(endpoint, operation = 'request') {
  if (!activeTraceReceiver) return null;
  const origin = globalThis.location?.origin;
  if (!origin) return null;
  let target;
  try { target = new URL(endpoint, origin); } catch { return null; }
  // Never forward correlation headers or telemetry onto external/untrusted services.
  if (target.origin !== origin || !['/api/chat', '/api/health', '/mcp'].includes(target.pathname)) return null;
  const traceId = globalThis.crypto?.randomUUID?.() || null;
  if (!traceId) {
    activeTraceReceiver('coverage.warning', { reason: 'random-uuid-unavailable' });
    return null;
  }
  activeTraceReceiver('alice.backend.started', {
    trace_id: traceId,
    route: target.pathname,
    operation,
  });
  return traceId;
}

export function finishAliceBackendTrace(traceId, { status = null, acknowledged = false, error = null } = {}) {
  if (!activeTraceReceiver || !traceId) return;
  activeTraceReceiver('alice.backend.finished', {
    trace_id: traceId,
    status: Number.isInteger(status) ? status : null,
    server_ack: acknowledged === true,
    error: error === 'transport-failed' ? 'transport-failed' : null,
  });
}


export function safeResourceLabel(input, sameOrigin = '') {
  try {
    const value = new URL(input, sameOrigin || undefined);
    if (!['http:', 'https:'].includes(value.protocol)) return '[non-http resource]';
    if (value.origin !== sameOrigin) return value.origin + '/[cross-origin path omitted]';
    return value.pathname.split('/').map((part) =>
      /^(?:[0-9a-f]{16,}|[A-Za-z0-9_-]{24,}|\d{5,})$/i.test(part) ? ':id' : part
    ).join('/');
  } catch {
    return '[unparseable resource]';
  }
}

function isInspectorNode(node) {
  const element = node?.nodeType === 1 ? node : node?.parentElement;
  return Boolean(element?.closest?.('[data-alice-telemetry-root]'));
}

function elementIsHidden(element) {
  if (element.hidden || element.inert || element.getAttribute('aria-hidden') === 'true') return true;
  const style = globalThis.getComputedStyle?.(element);
  return style?.display === 'none' || style?.visibility === 'hidden' || style?.visibility === 'collapse'
    || Number(style?.opacity) === 0;
}

export function sampleDom(limit = 1200) {
  if (typeof document === 'undefined') return { inspected: 0, hidden: 0, frames: 0, truncated: false };
  const elements = document.querySelectorAll('body *');
  let inspected = 0;
  let hidden = 0;
  let frames = 0;
  for (const element of elements) {
    if (isInspectorNode(element)) continue;
    if (inspected >= limit) break;
    inspected += 1;
    if (element.tagName === 'IFRAME') frames += 1;
    if (elementIsHidden(element)) hidden += 1;
  }
  return { inspected, hidden, frames, truncated: elements.length > inspected + 150 };
}

export function createUiTelemetry({ limit = DEFAULT_LIMIT } = {}) {
  const subscribers = new Set();
  const cleanup = [];
  let running = false;
  let state = {
    running: false,
    startedAt: null,
    stoppedAt: null,
    counts: { domChanges: 0, interactions: 0, resources: 0, navigation: 0 },
    sample: null,
    events: [],
    coverage: 'Only this page DOM and observable browser resources. Not ChatGPT host UI, inaccessible iframes, closed shadow roots, OS processes or server-side MCP bindings.',
  };

  const notify = () => { for (const listener of subscribers) listener(); };
  const change = (patch) => { state = { ...state, ...patch }; notify(); };
  const append = (type, details = {}, countKey = null, increment = 1) => {
    if (!running) return;
    const event = { at: new Date().toISOString(), source: 'browser-local', type, details };
    const counts = { ...state.counts };
    if (countKey) counts[countKey] += increment;
    change({ counts, events: [...state.events, event].slice(-Math.max(10, limit)) });
  };

  const traceSink = (type, details) => append(type, details);

  function start() {
    if (running || typeof document === 'undefined') return false;
    running = true;
    activeTraceReceiver = traceSink;
    change({
      running: true,
      startedAt: new Date().toISOString(),
      stoppedAt: null,
      counts: { domChanges: 0, interactions: 0, resources: 0, navigation: 0 },
      events: [],
    });
    append('session.started', { origin: globalThis.location?.origin || '[unknown]' });
    const updateSample = () => change({ sample: sampleDom() });
    updateSample();

    const onClick = (event) => {
      if (isInspectorNode(event.target)) return;
      append('ui.click', { element: event.target?.tagName?.toLowerCase() || 'unknown' }, 'interactions');
    };
    const onFocus = (event) => {
      if (isInspectorNode(event.target)) return;
      append('ui.focus', { element: event.target?.tagName?.toLowerCase() || 'unknown' }, 'interactions');
    };
    const onRoute = () => {
      append('navigation', {
        route: safeResourceLabel(globalThis.location?.href, globalThis.location?.origin),
      }, 'navigation');
    };
    const onVisibility = () => append('page.visibility', { state: document.visibilityState });

    document.addEventListener('click', onClick, true);
    document.addEventListener('focusin', onFocus, true);
    document.addEventListener('visibilitychange', onVisibility);
    globalThis.addEventListener('popstate', onRoute);
    globalThis.addEventListener('hashchange', onRoute);
    cleanup.push(() => {
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('focusin', onFocus, true);
      document.removeEventListener('visibilitychange', onVisibility);
      globalThis.removeEventListener('popstate', onRoute);
      globalThis.removeEventListener('hashchange', onRoute);
    });

    let pending = { added: 0, removed: 0, attributeChanges: 0 };
    let flushTimer = null;
    const flush = () => {
      flushTimer = null;
      const batch = pending;
      pending = { added: 0, removed: 0, attributeChanges: 0 };
      const total = batch.added + batch.removed + batch.attributeChanges;
      if (total) append('dom.mutation', batch, 'domChanges', total);
    };
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (isInspectorNode(mutation.target)) continue;
        if (mutation.type === 'attributes') pending.attributeChanges += 1;
        if (mutation.type === 'childList') {
          pending.added += [...mutation.addedNodes].filter((n) => !isInspectorNode(n)).length;
          pending.removed += [...mutation.removedNodes].filter((n) => !isInspectorNode(n)).length;
        }
      }
      if (!flushTimer && Object.values(pending).some(Boolean)) flushTimer = setTimeout(flush, 500);
    });
    observer.observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['hidden', 'style', 'class', 'aria-hidden', 'inert'],
    });
    cleanup.push(() => { observer.disconnect(); if (flushTimer) { clearTimeout(flushTimer); flush(); } });

    if (typeof PerformanceObserver !== 'undefined') {
      try {
        const resourceObserver = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            const details = {
              resource: safeResourceLabel(entry.name, globalThis.location.origin),
              kind: entry.initiatorType || 'resource',
              durationMs: Math.round(entry.duration),
            };
            if (Number.isInteger(entry.responseStatus) && entry.responseStatus > 0) {
              details.status = entry.responseStatus;
            }
            append('network.resource', details, 'resources');
          }
        });
        resourceObserver.observe({ type: 'resource', buffered: false });
        cleanup.push(() => resourceObserver.disconnect());
      } catch {
        append('coverage.warning', { reason: 'resource-observer-unavailable' });
      }
    } else {
      append('coverage.warning', { reason: 'performance-observer-unavailable' });
    }

    const interval = setInterval(updateSample, 5000);
    cleanup.push(() => clearInterval(interval));
    return true;
  }

  function stop() {
    if (!running) return;
    while (cleanup.length) cleanup.pop()();
    append('session.stopped');
    running = false;
    if (activeTraceReceiver === traceSink) activeTraceReceiver = null;
    change({ running: false, stoppedAt: new Date().toISOString() });
  }

  function clear() {
    change({ events: [], counts: { domChanges: 0, interactions: 0, resources: 0, navigation: 0 } });
  }

  function exportJson() {
    return JSON.stringify({
      schema: 'alice.uiux.telemetry.v1',
      exportedAt: new Date().toISOString(),
      ...state,
    }, null, 2);
  }

  return {
    start, stop, clear, exportJson,
    getSnapshot: () => state,
    subscribe(listener) { subscribers.add(listener); return () => subscribers.delete(listener); },
  };
}
