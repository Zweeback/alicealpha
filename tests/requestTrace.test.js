import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';
import { ALICE_TRACE_HEADER, attachAliceRequestTrace, validAliceTraceId, safeMcpTraceMetadata } from '../server/requestTrace.js';

const ID = '865c30df-befd-4f62-953d-0dc44d7125bf';

function responseMock() {
  const response = new EventEmitter();
  response.headers = {};
  response.statusCode = 200;
  response.set = function (name, value) { this.headers[name] = value; return this; };
  return response;
}

describe('Alice privacy-constrained trace correlation', () => {
  it('accepts only canonical random UUIDv4 trace IDs', () => {
    expect(validAliceTraceId(ID)).toBe(true);
    expect(validAliceTraceId('evil injected value')).toBe(false);
    expect(validAliceTraceId('')).toBe(false);
    expect(validAliceTraceId('00000000-0000-0000-0000-000000000000')).toBe(false);
  });

  it('emits a server acknowledgement without request secrets or body', () => {
    const events = [];
    const req = {
      path: '/api/chat',
      method: 'POST',
      headers: { authorization: 'Bearer TOPSECRET' },
      body: { text: 'PRIVATE MESSAGE' },
      query: { api_key: 'ALSOSECRET' },
      get: (key) => key === ALICE_TRACE_HEADER ? ID : null,
    };
    const res = responseMock();
    expect(attachAliceRequestTrace(req, res, (event) => events.push(event))).toBe(true);
    expect(res.headers[ALICE_TRACE_HEADER]).toBe(ID);
    res.statusCode = 503;
    res.emit('finish');
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      schema: 'alice.server.trace.v1',
      source: 'alice-server',
      route: 'chat',
      trace_id: ID,
      status: 503,
    });
    expect(events[0].duration_ms).toBeGreaterThanOrEqual(0);
    expect(JSON.stringify(events[0])).not.toMatch(/TOPSECRET|PRIVATE MESSAGE|ALSOSECRET/);
  });

  it('ignores requests without valid correlation ID and unrelated routes', () => {
    const invalid = { path: '/api/health', get: () => 'invalid' };
    const unknown = { path: '/api/hidden', get: () => ID };
    expect(attachAliceRequestTrace(invalid, responseMock())).toBe(false);
    expect(attachAliceRequestTrace(unknown, responseMock())).toBe(false);
  });

  it('labels MCP calls but cannot infer a ChatGPT-host UI action', () => {
    const events = [];
    const req = { path: '/mcp', method: 'POST', get: () => ID, body: { jsonrpc: '2.0', method: 'tools/call', params: { secret: 'NOT_LOGGED' } } };
    const res = responseMock();
    expect(attachAliceRequestTrace(req, res, (event) => events.push(event))).toBe(true);
    res.emit('finish');
    expect(events[0].route).toBe('mcp');
    expect(events[0].mcp_methods).toEqual(['tools/call']);
    expect(events[0].mcp_tools).toEqual([]);
    expect(events[0]).not.toHaveProperty('host_action');
    expect(JSON.stringify(events[0])).not.toContain('NOT_LOGGED');
  });

  it('records only explicitly known MCP tool names, not sensitive parameters', () => {
    const result = safeMcpTraceMetadata([
      { method: 'tools/call', params: { name: 'open_alice', secret: 'SENSITIVE' } },
      { method: 'tools/list', params: { bearer: 'TOP_SECRET' } },
      { method: 'unsafe/tool', params: { name: 'injected' } },
    ]);
    expect(result).toEqual({ mcp_methods: ['tools/call', 'tools/list'], mcp_tools: ['open_alice'] });
    expect(JSON.stringify(result)).not.toMatch(/SENSITIVE|TOP_SECRET|injected/);
  });
});
