// Client for the Sancho bridge unix socket opened by the ACP native host.
// Frame format: newline-delimited JSON. First frame must be {"token": "..."}.

import { connect } from "node:net";

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function connectBridge({ socketPath, token, retries = 10, retryDelayMs = 500 }) {
  let lastError = null;
  for (let attempt = 0; attempt < retries; attempt += 1) {
    try {
      return await openConnection(socketPath, token);
    } catch (error) {
      lastError = error;
      await sleep(retryDelayMs);
    }
  }
  throw lastError ?? new Error("bridge unavailable");
}

function openConnection(socketPath, token) {
  return new Promise((resolve, reject) => {
    const socket = connect(socketPath);
    let lineBuffer = "";
    const pending = new Map();

    const fail = (error) => {
      socket.destroy();
      reject(error);
    };

    socket.setEncoding("utf8");
    socket.on("error", fail);
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
        if (pending.has("handshake")) {
          pending.get("handshake")(frame);
          pending.delete("handshake");
          continue;
        }
        if (typeof frame.id === "string" && pending.has(frame.id)) {
          pending.get(frame.id)(frame);
          pending.delete(frame.id);
        }
      }
    });

    pending.set("handshake", (frame) => {
      if (frame.ok) {
        socket.removeListener("error", fail);
        resolve({
          invoke(name, args) {
            return new Promise((resolveInvoke, rejectInvoke) => {
              const id = crypto.randomUUID();
              const timer = setTimeout(() => {
                pending.delete(id);
                rejectInvoke(new Error("tool result timeout"));
              }, 60_000);
              pending.set(id, (frame) => {
                clearTimeout(timer);
                resolveInvoke(frame.result);
              });
              socket.write(JSON.stringify({ id, name, arguments: args }) + "\n");
            });
          },
          close: () => socket.destroy(),
        });
      } else {
        socket.destroy();
        reject(new Error(frame.error ?? "bridge rejected"));
      }
    });

    socket.on("connect", () => {
      socket.write(JSON.stringify({ token: token ?? null }) + "\n");
    });
  });
}
