#!/usr/bin/env node

// Native messaging host bridging Sancho (Chrome) to a local ACP agent over stdio.
// Chrome frames: 4-byte little-endian length + JSON payload. ACP frames: NDJSON lines.

import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const AGENT_COMMAND = process.env.SANCHO_ACP_COMMAND ?? "opencode";
const AGENT_ARGS = process.env.SANCHO_ACP_ARGS?.split(" ") ?? ["acp"];

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
      sendFrame({ type: "handshake.ok" });
      startAgent();
      continue;
    }

    let message = raw;
    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed === "string") message = parsed;
    } catch {
      // raw NDJSON string forwarded as-is
    }
    agent.stdin.write(message.replace(/\n+$/, "") + "\n");
  }
});

process.stdin.on("end", () => process.exit(0));
