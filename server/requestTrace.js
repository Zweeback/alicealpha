// Opt-in, privacy-limited correlation for owned Alice endpoints.
// Never record URLs, payloads, credentials, cookies, IP addresses, or response bodies.
export const ALICE_TRACE_HEADER = 'X-Alice-Trace-Id';
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ROUTES = Object.freeze({
  '/api/health': 'health',
  '/api/chat': 'chat',
  '/mcp': 'mcp',
});
export function validAliceTraceId(value) {
  return typeof value === 'string' && UUID_V4.test(value);
}

export function attachAliceRequestTrace(request, response, emit = (entry) =>
  console.info('[alice-trace]', JSON.stringify(entry))) {
  const route = ROUTES[request.path];
  const traceId = request.get?.(ALICE_TRACE_HEADER);
  if (!route || !validAliceTraceId(traceId)) return false;
  const start = performance.now();
  response.set(ALICE_TRACE_HEADER, traceId);
  response.set('Cache-Control', 'no-store');
  response.on('finish', () => {
    emit({
      schema: 'alice.server.trace.v1',
      timestamp: new Date().toISOString(),
      trace_id: traceId,
      route,
      method: request.method === 'POST' ? 'POST' : 'GET',
      status: response.statusCode,
      duration_ms: Math.max(0, Math.round(performance.now() - start)),
      source: 'alice-server',
    });
  });
  return true;
}
