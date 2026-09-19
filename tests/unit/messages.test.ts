import { describe, expect, it } from "vitest";
import { isEnvelope, makeEnvelope } from "../../src/bridge/messages";

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
