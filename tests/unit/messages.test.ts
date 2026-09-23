import { describe, expect, it } from "vitest";
import { isEnvelope, makeEnvelope, postToPort } from "../../src/bridge/messages";

describe("message envelope", () => {
  it("creates envelopes with generated ids", () => {
    const envelope = makeEnvelope("request", "chat.send", { text: "hi", tabId: 1 });
    expect(envelope.kind).toBe("request");
    expect(envelope.type).toBe("chat.send");
    expect(envelope.id).toBeTruthy();
    expect(isEnvelope(envelope)).toBe(true);
  });

  it("round-trips through JSON serialization", () => {
    const envelope = makeEnvelope("event", "chat.delta", { messageId: "m1", text: "abc" }, "id-1");
    const parsed: unknown = JSON.parse(JSON.stringify(envelope));
    expect(isEnvelope(parsed)).toBe(true);
    expect(parsed).toEqual(envelope);
  });

  it("rejects malformed values", () => {
    expect(isEnvelope(null)).toBe(false);
    expect(isEnvelope({})).toBe(false);
    expect(isEnvelope({ kind: "nope", type: "x", id: "1", payload: {} })).toBe(false);
    expect(isEnvelope({ kind: "request", type: 5, id: "1", payload: {} })).toBe(false);
    expect(isEnvelope({ kind: "request", type: "x", payload: {} })).toBe(false);
  });
});

describe("postToPort", () => {
  const envelope = makeEnvelope("event", "chat.state", {
    state: "done" as const,
    conversationId: "c1",
  });

  it("posts to a live port", () => {
    const sent: unknown[] = [];
    const port = { postMessage: (m: unknown) => sent.push(m) } as unknown as chrome.runtime.Port;
    postToPort(port, envelope);
    expect(sent).toEqual([envelope]);
  });

  it("ignores disconnected ports", () => {
    const port = {
      postMessage: () => {
        throw new Error("Attempting to use a disconnected port object");
      },
    } as unknown as chrome.runtime.Port;
    expect(() => postToPort(port, envelope)).not.toThrow();
  });

  it("rethrows unexpected postMessage errors", () => {
    const port = {
      postMessage: () => {
        throw new Error("something else");
      },
    } as unknown as chrome.runtime.Port;
    expect(() => postToPort(port, envelope)).toThrow("something else");
  });
});
