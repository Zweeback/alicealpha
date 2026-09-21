import dns from "node:dns/promises";
import tls from "node:tls";
import https from "node:https";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const url = new URL("https://mcp.pianam.cn/ai/mcp");
const host = url.hostname;

function errView(e, depth = 0) {
  if (!e || depth > 5) return e;
  return {
    name: e.name,
    message: e.message,
    code: e.code,
    errno: e.errno,
    syscall: e.syscall,
    address: e.address,
    port: e.port,
    cause: e.cause ? errView(e.cause, depth + 1) : undefined,
  };
}

async function dnsProbe() {
  try {
    const rows = await dns.lookup(host, { all: true, verbatim: true });
    console.log("DNS_SUCCESS", JSON.stringify(rows));
  } catch (e) {
    console.error("DNS_FAILED", JSON.stringify(errView(e)));
  }
}

async function tlsProbe() {
  await new Promise((resolve) => {
    const socket = tls.connect({
      host,
      port: 443,
      servername: host,
      rejectUnauthorized: true,
      timeout: 10000,
    });
    socket.once("secureConnect", () => {
      console.log("TLS_SUCCESS", JSON.stringify({
        remoteAddress: socket.remoteAddress,
        remoteFamily: socket.remoteFamily,
        authorized: socket.authorized,
        protocol: socket.getProtocol(),
        cipher: socket.getCipher()?.name,
      }));
      socket.end();
      resolve();
    });
    socket.once("timeout", () => {
      console.error("TLS_TIMEOUT");
      socket.destroy();
      resolve();
    });
    socket.once("error", (e) => {
      console.error("TLS_FAILED", JSON.stringify(errView(e)));
      resolve();
    });
  });
}

async function httpsProbe(family) {
  await new Promise((resolve) => {
    const req = https.request(url, {
      method: "GET",
      family,
      timeout: 10000,
      headers: {
        accept: "application/json, text/event-stream",
        "user-agent": "alice-pianam-diag/1.1",
      },
    }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { if (body.length < 600) body += chunk; });
      res.on("end", () => {
        console.log(`HTTPS_GET_F${family}_SUCCESS`, JSON.stringify({
          status: res.statusCode,
          headers: {
            server: res.headers.server,
            via: res.headers.via,
            location: res.headers.location,
            contentType: res.headers["content-type"],
          },
          body: body.slice(0, 300),
        }));
        resolve();
      });
    });
    req.once("timeout", () => {
      console.error(`HTTPS_GET_F${family}_TIMEOUT`);
      req.destroy();
      resolve();
    });
    req.once("error", (e) => {
      console.error(`HTTPS_GET_F${family}_FAILED`, JSON.stringify(errView(e)));
      resolve();
    });
    req.end();
  });
}

async function mcpProbe() {
  const client = new Client({ name: "alice-pianam-probe", version: "1.1.0" });
  try {
    const transport = new StreamableHTTPClientTransport(url);
    await client.connect(transport);
    console.log("INITIALIZE_SUCCESS");
    const result = await client.listTools();
    console.log("TOOLS_LIST_SUCCESS", JSON.stringify(result.tools.map(t => t.name)));
    console.log("TOOL_COUNT", result.tools.length);
    await client.close();
    return true;
  } catch (e) {
    console.error("MCP_PROBE_FAILED", JSON.stringify(errView(e)));
    console.error("MCP_PROBE_STACK", e?.stack || String(e));
    try { await client.close(); } catch {}
    return false;
  }
}

console.log("DIAG_START", new Date().toISOString(), url.href);
await dnsProbe();
await tlsProbe();
await httpsProbe(4);
await httpsProbe(6);
const ok = await mcpProbe();
console.log("DIAG_END", new Date().toISOString(), ok ? "PASS" : "FAIL");
process.exit(ok ? 0 : 1);
