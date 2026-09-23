#!/usr/bin/env node

// MCP stdio server exposing Sancho's browser tools to ACP agents.
// Tool calls are relayed to the extension through the bridge unix socket.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { connectBridge } from "./bridge-client.mjs";

const SOCKET_PATH = process.env.SANCHO_BRIDGE_SOCK;
const TOKEN = process.env.SANCHO_ACP_TOKEN ?? null;

if (!SOCKET_PATH) {
  console.error("SANCHO_BRIDGE_SOCK is not set");
  process.exit(1);
}

const bridge = await connectBridge({ socketPath: SOCKET_PATH, token: TOKEN });

const server = new McpServer({ name: "sancho-browser", version: "0.1.0" });

function asTextResult(value) {
  return { content: [{ type: "text", text: JSON.stringify(value) }] };
}

server.registerTool(
  "read_page",
  {
    description:
      "Read the text content of the browser's active tab. Use mode=selection to read only the selected text.",
    inputSchema: { mode: z.enum(["full", "selection"]).optional() },
  },
  async ({ mode }) => asTextResult(await bridge.invoke("readPage", { mode: mode ?? "full" })),
);

server.registerTool(
  "fill_field",
  {
    description: "Fill a text input, textarea, or contenteditable element on the active tab.",
    inputSchema: { selector: z.string(), value: z.string() },
  },
  async (args) => asTextResult(await bridge.invoke("fillField", args)),
);

server.registerTool(
  "click_element",
  {
    description: "Click an element on the active tab identified by a CSS selector.",
    inputSchema: { selector: z.string() },
  },
  async (args) => asTextResult(await bridge.invoke("clickElement", args)),
);

server.registerTool(
  "select_option",
  {
    description: "Select an option of a <select> element on the active tab.",
    inputSchema: { selector: z.string(), value: z.string() },
  },
  async (args) => asTextResult(await bridge.invoke("selectOption", args)),
);

server.registerTool(
  "capture_screenshot",
  {
    description:
      "Capture the visible browser tab as an image. Requires the user to have granted screenshot consent.",
    inputSchema: {},
  },
  async () => asTextResult(await bridge.invoke("captureScreenshot", {})),
);

server.registerTool(
  "console_messages",
  {
    description:
      "Read recent console messages and JavaScript errors from the active tab. Requires the user to have granted page diagnostics consent.",
    inputSchema: {
      limit: z.number().int().min(1).max(200).optional(),
      level: z.enum(["log", "info", "warn", "error", "exception"]).optional(),
    },
  },
  async (args) => asTextResult(await bridge.invoke("getConsoleMessages", args)),
);

server.registerTool(
  "network_requests",
  {
    description:
      "List recent network requests (URL, method, status or failure reason, timing) for the active tab. Metadata only. Requires the user to have granted page diagnostics consent.",
    inputSchema: { limit: z.number().int().min(1).max(100).optional() },
  },
  async (args) => asTextResult(await bridge.invoke("getNetworkRequests", args)),
);

await server.connect(new StdioServerTransport());
