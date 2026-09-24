const PROTOCOL_VERSION = '2025-06-18';
const RESOURCE_URI = 'ui://alice/companion-v1.html';
const RESOURCE_MIME_TYPE = 'text/html;profile=mcp-app';
const APP_ORIGIN = 'https://alicealpha.onrender.com';
const APP_URL = `${APP_ORIGIN}/?visual=3d&avatar=trellis&embed=chatgpt`;

const RESOURCE_META = Object.freeze({
  ui: {
    prefersBorder: false,
    domain: APP_ORIGIN,
    csp: {
      connectDomains: [APP_ORIGIN],
      resourceDomains: [APP_ORIGIN],
      frameDomains: [APP_ORIGIN],
    },
  },
  'openai/widgetDomain': APP_ORIGIN,
});

const TOOL_META = Object.freeze({
  ui: { resourceUri: RESOURCE_URI },
  'openai/outputTemplate': RESOURCE_URI,
  'openai/widgetAccessible': true,
  'openai/toolInvocation/invoking': 'Alice kommt in den Chat',
  'openai/toolInvocation/invoked': 'Alice ist da',
});

const WIDGET_HTML = `<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover" />
  <title>Alice</title>
  <style>
    html,body{margin:0;width:100%;height:100%;background:#070b0d;color:#edf7f7;font-family:ui-sans-serif,system-ui,-apple-system,sans-serif}
    body{min-height:560px;overflow:hidden}
    .shell{height:100vh;min-height:560px;display:grid;grid-template-rows:42px 1fr;background:#070b0d}
    .bar{display:flex;align-items:center;gap:9px;padding:0 12px;border-bottom:1px solid rgba(96,226,235,.15);background:rgba(5,10,12,.96)}
    .pulse{width:8px;height:8px;border-radius:50%;background:#48e2e9;box-shadow:0 0 14px rgba(72,226,233,.7)}
    .name{font-size:13px;font-weight:650;letter-spacing:.02em}
    .state{margin-left:auto;font-size:11px;opacity:.58}
    iframe{width:100%;height:100%;border:0;background:#070b0d}
  </style>
</head>
<body>
  <div class="shell">
    <div class="bar"><span class="pulse"></span><span class="name">Alice</span><span class="state">3D Companion · live</span></div>
    <iframe
      src="${APP_URL}"
      title="Alice 3D Companion"
      allow="microphone; camera; autoplay; xr-spatial-tracking; fullscreen"
      referrerpolicy="no-referrer"
    ></iframe>
  </div>
</body>
</html>`;

const TOOLS = Object.freeze([
  {
    name: 'open_alice',
    title: 'Alice öffnen',
    description: 'Öffnet Alice als interaktive 3D-Begleiterin direkt im Chat. Nutze dieses Tool, wenn der Nutzer Alice sehen, mit ihr sprechen oder die Companion-Oberfläche öffnen möchte.',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
    },
    _meta: TOOL_META,
  },
  {
    name: 'alice_status',
    title: 'Alice Status',
    description: 'Liefert den aktuellen veröffentlichten Alice-MVP-Status und die Companion-Oberfläche.',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
    },
    _meta: TOOL_META,
  },
]);

function rpcResult(id, result) {
  return { jsonrpc: '2.0', id, result };
}

function rpcError(id, code, message) {
  return { jsonrpc: '2.0', id: id ?? null, error: { code, message } };
}

function toolPayload(name) {
  return {
    content: [{
      type: 'text',
      text: name === 'open_alice'
        ? 'Alice ist als interaktive 3D-Companion-Oberfläche geöffnet. Die Unterhaltung kann normal weiterlaufen.'
        : 'Alice Companion MVP ist online. 3D-Körper, Text, Voice-Realtime-Fallback, Memory/Companion-State und WebXR liegen im selben Runtime-Kern.',
    }],
    structuredContent: {
      identity: 'alice',
      surface: 'chatgpt-mcp-app',
      appUrl: APP_URL,
      capabilities: [
        '3d-avatar',
        'text-chat',
        'voice-realtime',
        'companion-continuity',
        'confirmed-memory',
        'webxr',
      ],
    },
    _meta: TOOL_META,
  };
}

export function dispatchAliceMcp(message) {
  if (!message || message.jsonrpc !== '2.0' || typeof message.method !== 'string') {
    return rpcError(message?.id, -32600, 'Invalid Request');
  }

  const { id, method, params } = message;

  if (method === 'notifications/initialized' || method.startsWith('notifications/')) {
    return null;
  }

  if (method === 'initialize') {
    return rpcResult(id, {
      protocolVersion: params?.protocolVersion || PROTOCOL_VERSION,
      capabilities: {
        tools: { listChanged: false },
        resources: { subscribe: false, listChanged: false },
      },
      serverInfo: {
        name: 'alice-companion',
        version: '1.0.0',
      },
      instructions: 'Use open_alice to render Alice as a 3D companion inside ChatGPT. Keep conversation state in the host conversation; Alice permanent memory still requires explicit confirmation.',
    });
  }

  if (method === 'ping') return rpcResult(id, {});

  if (method === 'tools/list') {
    return rpcResult(id, { tools: TOOLS });
  }

  if (method === 'tools/call') {
    const name = params?.name;
    if (name === 'open_alice' || name === 'alice_status') {
      return rpcResult(id, toolPayload(name));
    }
    return rpcError(id, -32602, `Unknown tool: ${String(name || '')}`);
  }

  if (method === 'resources/list') {
    return rpcResult(id, {
      resources: [{
        name: 'Alice 3D Companion',
        uri: RESOURCE_URI,
        description: 'Interactive Alice companion surface',
        mimeType: RESOURCE_MIME_TYPE,
        _meta: TOOL_META,
      }],
    });
  }

  if (method === 'resources/templates/list') {
    return rpcResult(id, { resourceTemplates: [] });
  }

  if (method === 'resources/read') {
    if (params?.uri !== RESOURCE_URI) {
      return rpcError(id, -32602, 'Unknown resource');
    }
    return rpcResult(id, {
      contents: [{
        uri: RESOURCE_URI,
        mimeType: RESOURCE_MIME_TYPE,
        text: WIDGET_HTML,
        _meta: RESOURCE_META,
      }],
    });
  }

  return rpcError(id, -32601, `Method not found: ${method}`);
}

export function handleAliceMcpHttp(request, response) {
  response.set({
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'content-type, mcp-protocol-version',
    'Access-Control-Expose-Headers': 'mcp-protocol-version',
    'Cache-Control': 'no-store',
    'MCP-Protocol-Version': request.headers['mcp-protocol-version'] || PROTOCOL_VERSION,
  });

  const messages = Array.isArray(request.body) ? request.body : [request.body];
  const replies = messages.map(dispatchAliceMcp).filter(Boolean);

  if (replies.length === 0) {
    response.status(202).end();
    return;
  }

  response.type('application/json');
  response.status(200).send(JSON.stringify(Array.isArray(request.body) ? replies : replies[0]));
}

export const aliceMcp = Object.freeze({
  protocolVersion: PROTOCOL_VERSION,
  resourceUri: RESOURCE_URI,
  resourceMimeType: RESOURCE_MIME_TYPE,
  appUrl: APP_URL,
  tools: TOOLS,
});
