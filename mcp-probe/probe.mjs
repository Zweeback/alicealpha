import dns from "node:dns/promises";
import tls from "node:tls";
import https from "node:https";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const targets = [
  { name: "pianam", url: new URL("https://mcp.pianam.cn/ai/mcp"), mcp: true },
  { name: "deepwiki", url: new URL("https://mcp.deepwiki.com/mcp"), mcp: true },
  { name: "mslearn", url: new URL("https://learn.microsoft.com/api/mcp"), mcp: true },
  { name: "example", url: new URL("https://example.com/"), mcp: false },
];

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

async function dnsProbe(name, host) {
  try {
    const rows = await dns.lookup(host, { all: true, verbatim: true });
    console.log(name.toUpperCase() + "_DNS_SUCCESS", JSON.stringify(rows));
    return true;
  } catch (e) {
    console.error(name.toUpperCase() + "_DNS_FAILED", JSON.stringify(errView(e)));
    return false;
  }
}

async function tlsProbe(name, host) {
  return await new Promise((resolve) => {
    const socket = tls.connect({
      host,
      port: 443,
      servername: host,
      rejectUnauthorized: true,
      timeout: 10000,
    });
    socket.once("secureConnect", () => {
      console.log(name.toUpperCase() + "_TLS_SUCCESS", JSON.stringify({
        remoteAddress: socket.remoteAddress,
        remoteFamily: socket.remoteFamily,
        authorized: socket.authorized,
        protocol: socket.getProtocol(),
        cipher: socket.getCipher()?.name,
      }));
      socket.end();
      resolve(true);
    });
    socket.once("timeout", () => {
      console.error(name.toUpperCase() + "_TLS_TIMEOUT");
      socket.destroy();
      resolve(false);
    });
    socket.once("error", (e) => {
      console.error(name.toUpperCase() + "_TLS_FAILED", JSON.stringify(errView(e)));
      resolve(false);
    });
  });
}

async function httpsProbe(name, url, family) {
  return await new Promise((resolve) => {
    const req = https.request(url, {
      method: "GET",
      family,
      timeout: 10000,
      headers: {
        accept: "application/json, text/event-stream",
        "user-agent": "alice-mcp-control-diag/1.2",
      },
    }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { if (body.length < 600) body += chunk; });
      res.on("end", () => {
        console.log(name.toUpperCase() + `_HTTPS_GET_F${family}_SUCCESS`, JSON.stringify({
          status: res.statusCode,
          contentType: res.headers["content-type"],
          location: res.headers.location,
          body: body.slice(0, 200),
        }));
        resolve(true);
      });
    });
    req.once("timeout", () => {
      console.error(name.toUpperCase() + `_HTTPS_GET_F${family}_TIMEOUT`);
      req.destroy();
      resolve(false);
    });
    req.once("error", (e) => {
      console.error(name.toUpperCase() + `_HTTPS_GET_F${family}_FAILED`, JSON.stringify(errView(e)));
      resolve(false);
    });
    req.end();
  });
}

async function mcpProbe(name, url) {
  const client = new Client({ name: "alice-" + name + "-probe", version: "1.2.0" });
  try {
    const transport = new StreamableHTTPClientTransport(url);
    await client.connect(transport);
    console.log(name.toUpperCase() + "_INITIALIZE_SUCCESS");
    const result = await client.listTools();
    console.log(name.toUpperCase() + "_TOOLS_LIST_SUCCESS", JSON.stringify(result.tools.map(t => t.name)));
    console.log(name.toUpperCase() + "_TOOL_COUNT", result.tools.length);
    await client.close();
    return true;
  } catch (e) {
    console.error(name.toUpperCase() + "_MCP_PROBE_FAILED", JSON.stringify(errView(e)));
    console.error(name.toUpperCase() + "_MCP_PROBE_STACK", e?.stack || String(e));
    try { await client.close(); } catch {}
    return false;
  }
}

console.log("CONTROL_DIAG_START", new Date().toISOString());

let allMcp = true;
for (const target of targets) {
  console.log("TARGET_START", target.name, target.url.href);
  await dnsProbe(target.name, target.url.hostname);
  await tlsProbe(target.name, target.url.hostname);
  await httpsProbe(target.name, target.url, 4);
  if (target.name === "pianam") await httpsProbe(target.name, target.url, 6);
  if (target.mcp) {
    const ok = await mcpProbe(target.name, target.url);
    allMcp = allMcp && ok;
  }
  console.log("TARGET_END", target.name);
}

console.log("CONTROL_DIAG_END", new Date().toISOString(), allMcp ? "ALL_MCP_PASS" : "ONE_OR_MORE_MCP_FAIL");
process.exit(allMcp ? 0 : 1);
