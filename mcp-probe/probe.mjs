import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const url = new URL("https://mcp.pianam.cn/ai/mcp");
const client = new Client({name:"alice-pianam-probe",version:"1.0.0"});
try {
  const transport = new StreamableHTTPClientTransport(url);
  await client.connect(transport);
  console.log("INITIALIZE_SUCCESS");
  const result = await client.listTools();
  console.log("TOOLS_LIST_SUCCESS", JSON.stringify(result.tools.map(t=>t.name)));
  console.log("TOOL_COUNT", result.tools.length);
  await client.close();
  process.exit(0);
} catch (e) {
  console.error("MCP_PROBE_FAILED", e?.stack || e);
  process.exit(1);
}