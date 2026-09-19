import { describe, expect, it, vi } from "vitest";
import { connectAcpHost, type NativePort } from "../../src/providers/acp-transport";

function makeFakePort(): NativePort & {
  sent: unknown[];
  disconnect: () => void;
  emit: (message: unknown) => void;
  disconnected: boolean;
} {
  const listeners: Array<(message: unknown) => void> = [];
  const port = {
    sent: [] as unknown[],
    disconnected: false,
    postMessage(message: unknown) {
      this.sent.push(message);
    },
    onMessage: {
      addListener(listener: (message: unknown) => void) {
        listeners.push(listener);
      },
    },
    emit(message: unknown) {
      listeners.forEach((listener) => listener(message));
    },
    disconnect() {
      this.disconnected = true;
    },
  };
  return port;
}

describe("ACP native host handshake", () => {
  it("sends the handshake token as the first message", async () => {
    const port = makeFakePort();
    const pending = connectAcpHost(port, { hostName: "sancho-host", token: "abc" });
    expect(port.sent[0]).toEqual({ type: "handshake", token: "abc" });
    port.emit({ type: "handshake.ok" });
    await expect(pending).resolves.toBe(port);
  });

  it("rejects when the host closes the port on token mismatch", async () => {
    const port = makeFakePort();
    const pending = connectAcpHost(port, { hostName: "sancho-host", token: "wrong" });
    port.emit({ type: "handshake.error", message: "bad token" });
    await expect(pending).rejects.toThrow("bad token");
  });

  it("skips the token when none is configured", async () => {
    const port = makeFakePort();
    const pending = connectAcpHost(port, { hostName: "sancho-host" });
    expect(port.sent[0]).toEqual({ type: "handshake" });
    port.emit({ type: "handshake.ok" });
    await expect(pending).resolves.toBe(port);
  });

  it("times out when the host never answers", async () => {
    vi.useFakeTimers();
    const port = makeFakePort();
    const pending = connectAcpHost(port, { hostName: "sancho-host", token: "abc" }, 1000);
    const assertion = expect(pending).rejects.toThrow("handshake timeout");
    await vi.advanceTimersByTimeAsync(1001);
    await assertion;
    vi.useRealTimers();
  });
});
