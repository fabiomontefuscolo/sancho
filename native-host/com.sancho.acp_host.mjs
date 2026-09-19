#!/usr/bin/env node

// Native messaging host bridging Sancho (Chrome) to a local ACP agent over stdio.
// Chrome frames: 4-byte little-endian length + JSON payload. ACP frames: NDJSON lines.
// Also opens a per-user Unix socket so the MCP server spawned by the agent can relay
// browser tool calls back to the extension.

import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const AGENT_COMMAND = process.env.SANCHO_ACP_COMMAND ?? "opencode";
const AGENT_ARGS = process.env.SANCHO_ACP_ARGS?.split(" ") ?? ["acp"];
const HOST_DIR = dirname(fileURLToPath(import.meta.url));
const MCP_SERVER = join(HOST_DIR, "com.sancho.mcp_server.mjs");

const RUNTIME_DIR = process.env.XDG_RUNTIME_DIR ?? tmpdir();
const SOCKET_DIR = join(RUNTIME_DIR, `sancho-${process.getuid?.() ?? "user"}`);
const SOCKET_PATH = join(SOCKET_DIR, "bridge.sock");

function expectedToken() {
  if (process.env.SANCHO_ACP_TOKEN) return process.env.SANCHO_ACP_TOKEN;
  try {
    return readFileSync(join(homedir(), ".config", "sancho", "token"), "utf8").trim();
  } catch {
    return null;
  }
}

function sendFrame(payload) {
  const body = Buffer.from(JSON.stringify(payload), "utf8");
  const header = Buffer.alloc(4);
  header.writeUInt32LE(body.length, 0);
  process.stdout.write(Buffer.concat([header, body]));
}

function failHandshake(message) {
  sendFrame({ type: "handshake.error", message });
  process.exit(1);
}

let agent = null;
let buffer = Buffer.alloc(0);
let bridgeSocket = null;

function startBridgeServer(token) {
  mkdirSync(SOCKET_DIR, { recursive: true, mode: 0o700 });
  rmSync(SOCKET_PATH, { force: true });
  const server = createServer((socket) => {
    let authed = !token;
    let lineBuffer = "";
    socket.setEncoding("utf8");
    socket.on("data", (chunk) => {
      lineBuffer += chunk;
      let index;
      while ((index = lineBuffer.indexOf("\n")) >= 0) {
        const line = lineBuffer.slice(0, index).trim();
        lineBuffer = lineBuffer.slice(index + 1);
        if (!line) continue;
        let frame;
        try {
          frame = JSON.parse(line);
        } catch {
          continue;
        }
        if (!authed) {
          if (frame.token === token) {
            authed = true;
            bridgeSocket = socket;
            socket.write(JSON.stringify({ ok: true }) + "\n");
          } else {
            socket.write(JSON.stringify({ ok: false, error: "bad token" }) + "\n");
            socket.destroy();
          }
          continue;
        }
        if (typeof frame.id === "string" && typeof frame.name === "string") {
          sendFrame({ type: "tool.invoke", id: frame.id, name: frame.name, arguments: frame.arguments ?? {} });
        }
      }
    });
    socket.on("close", () => {
      if (bridgeSocket === socket) bridgeSocket = null;
    });
    socket.on("error", () => {});
  });
  server.listen(SOCKET_PATH);
  server.on("error", (error) => {
    console.error("bridge socket failed:", error.message);
  });
  process.on("exit", () => rmSync(SOCKET_PATH, { force: true }));
  return server;
}

function startAgent() {
  agent = spawn(AGENT_COMMAND, AGENT_ARGS, { stdio: ["pipe", "pipe", "inherit"] });
  agent.on("exit", (code) => process.exit(code ?? 0));
  let lineBuffer = "";
  agent.stdout.setEncoding("utf8");
  agent.stdout.on("data", (chunk) => {
    lineBuffer += chunk;
    let index;
    while ((index = lineBuffer.indexOf("\n")) >= 0) {
      const line = lineBuffer.slice(0, index).trim();
      lineBuffer = lineBuffer.slice(index + 1);
      if (line) sendFrame(line);
    }
  });
}

process.stdin.on("data", (chunk) => {
  buffer = Buffer.concat([buffer, chunk]);
  while (buffer.length >= 4) {
    const length = buffer.readUInt32LE(0);
    if (buffer.length < 4 + length) return;
    const raw = buffer.subarray(4, 4 + length).toString("utf8");
    buffer = buffer.subarray(4 + length);

    if (!agent) {
      let handshake;
      try {
        handshake = JSON.parse(raw);
      } catch {
        failHandshake("malformed handshake");
      }
      if (handshake?.type !== "handshake") failHandshake("expected handshake first");
      const token = expectedToken();
      if (token && handshake.token !== token) failHandshake("bad token");

      startBridgeServer(token);
      writeFileSync(join(SOCKET_DIR, "bridge.ready"), SOCKET_PATH, { mode: 0o600 });
      sendFrame({
        type: "handshake.ok",
        mcpServer: {
          name: "sancho-browser",
          command: process.execPath,
          args: [MCP_SERVER],
          env: {
            SANCHO_BRIDGE_SOCK: SOCKET_PATH,
            ...(token ? { SANCHO_ACP_TOKEN: token } : {}),
          },
        },
      });
      startAgent();
      continue;
    }

    let message = raw;
    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed === "string") {
        message = parsed;
      } else if (parsed && parsed.type === "tool.result" && bridgeSocket) {
        bridgeSocket.write(JSON.stringify(parsed) + "\n");
        continue;
      } else if (parsed && typeof parsed === "object") {
        continue;
      }
    } catch {
      // raw NDJSON string forwarded as-is
    }
    agent.stdin.write(message.replace(/\n+$/, "") + "\n");
  }
});

process.stdin.on("end", () => process.exit(0));
