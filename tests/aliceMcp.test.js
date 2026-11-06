import { describe, expect, it } from 'vitest';
import { aliceMcp, dispatchAliceMcp } from '../server/aliceMcp.js';

describe('Alice MCP App', () => {
  it('negotiates initialize and advertises tools/resources', () => {
    const init = dispatchAliceMcp({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2025-06-18' },
    });
    expect(init.result.serverInfo.name).toBe('alice-companion');
    expect(init.result.capabilities.tools).toBeTruthy();
    expect(init.result.capabilities.resources).toBeTruthy();

    const tools = dispatchAliceMcp({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
    expect(tools.result.tools.map((tool) => tool.name)).toContain('open_alice');
    expect(tools.result.tools.map((tool) => tool.name)).toContain('continue_alice');
  });

  it('returns a UI-backed 3D companion tool result', () => {
    const result = dispatchAliceMcp({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: { name: 'open_alice', arguments: {} },
    });

    expect(result.result.structuredContent.identity).toBe('alice');
    expect(result.result.structuredContent.surface).toBe('chatgpt-mcp-app');
    expect(result.result._meta.ui.resourceUri).toBe(aliceMcp.resourceUri);
  });

  it('invokes exactly one configured continue handler and returns verified state', async () => {
    let calls = 0;
    const result = await dispatchAliceMcp({
      jsonrpc: '2.0',
      id: 5,
      method: 'tools/call',
      params: { name: 'continue_alice', arguments: {} },
    }, {
      continueHandler: async () => {
        calls += 1;
        return {
          status: 'complete',
          executed: true,
          state: {
            current_step_id: null,
            next_step: null,
            verified_evidence: ['test:green'],
          },
        };
      },
    });

    expect(calls).toBe(1);
    expect(result.result.structuredContent.status).toBe('complete');
    expect(result.result.structuredContent.executed).toBe(true);
    expect(result.result.structuredContent.verifiedEvidence).toEqual(['test:green']);
  });

  it('serves a ChatGPT MCP App resource that embeds the live Alice runtime', () => {
    const result = dispatchAliceMcp({
      jsonrpc: '2.0',
      id: 4,
      method: 'resources/read',
      params: { uri: aliceMcp.resourceUri },
    });

    const resource = result.result.contents[0];
    expect(resource.mimeType).toBe('text/html;profile=mcp-app');
    expect(resource.text).toContain('Alice 3D Companion');
    expect(resource.text).toContain('alicealpha.onrender.com');
    expect(resource._meta.ui.csp.frameDomains).toEqual(['https://alicealpha.onrender.com']);
  });

  it('treats notifications as no-response messages', () => {
    expect(dispatchAliceMcp({
      jsonrpc: '2.0',
      method: 'notifications/initialized',
    })).toBeNull();
  });
});
