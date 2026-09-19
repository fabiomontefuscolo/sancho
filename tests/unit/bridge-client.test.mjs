import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createServer } from "node:net";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { connectBridge } from "../../native-host/bridge-client.mjs";

describe("bridge client", () => {
  let server;
  let socketPath;
  let dir;
  let received;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), "sancho-bridge-test-"));
    socketPath = join(dir, "bridge.sock");
    received = [];
  });

  afterEach(async () => {
    await new Promise((resolve) => (server?.listening ? server.close(resolve) : resolve()));
    rmSync(dir, { recursive: true, force: true });
  });

  function startServer(token) {
    server = createServer((socket) => {
      socket.setEncoding("utf8");
      let buffer = "";
      socket.on("data", (chunk) => {
        buffer += chunk;
        let index;
        while ((index = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, index).trim();
          buffer = buffer.slice(index + 1);
          if (!line) continue;
          const frame = JSON.parse(line);
          received.push(frame);
          if ("token" in frame && frame.id === undefined) {
            socket.write(JSON.stringify({ ok: frame.token === token }) + "\n");
          } else if (frame.id) {
            socket.write(JSON.stringify({ id: frame.id, result: { ok: true, echo: frame.name } }) + "\n");
          }
        }
      });
    });
    return new Promise((resolve) => server.listen(socketPath, resolve));
  }

  it("authenticates with the token and round-trips a tool call", async () => {
    await startServer("secret");
    const bridge = await connectBridge({ socketPath, token: "secret", retries: 1 });
    const result = await bridge.invoke("readPage", { mode: "full" });
    expect(result).toEqual({ ok: true, echo: "readPage" });
    expect(received[0]).toEqual({ token: "secret" });
    expect(received[1]).toMatchObject({ name: "readPage", arguments: { mode: "full" } });
    bridge.close();
  });

  it("rejects a wrong token", async () => {
    await startServer("secret");
    await expect(
      connectBridge({ socketPath, token: "wrong", retries: 1 }),
    ).rejects.toThrow();
  });

  it("retries until the bridge socket appears", async () => {
    const pending = connectBridge({ socketPath, token: null, retries: 5, retryDelayMs: 50 });
    await new Promise((resolve) => setTimeout(resolve, 120));
    await startServer(null);
    const bridge = await pending;
    expect(typeof bridge.invoke).toBe("function");
    bridge.close();
  });
});
