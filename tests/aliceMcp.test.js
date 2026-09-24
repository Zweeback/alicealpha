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
