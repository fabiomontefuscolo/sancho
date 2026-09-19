import { beforeEach, describe, expect, it, vi } from "vitest";
import { installMockChrome } from "./helpers/mock-chrome";
import { handlePermissionResponse, requestPermissionFromUser } from "../../src/agent/chat-handler";
import type { AnyEnvelope } from "../../src/bridge/messages";

function makePort() {
  const posted: AnyEnvelope[] = [];
  return {
    posted,
    postMessage: (message: unknown) => posted.push(message as AnyEnvelope),
  } as unknown as chrome.runtime.Port & { posted: AnyEnvelope[] };
}

describe("permission plumbing", () => {
  beforeEach(() => installMockChrome());

  it("posts permission.request and resolves with the user's choice", async () => {
    const port = makePort();
    const pending = requestPermissionFromUser(port, {
      title: "run command",
      options: [{ optionId: "allow", name: "Allow", kind: "allow_once" }],
    });

    const request = port.posted.find((envelope) => envelope.type === "permission.request");
    expect(request).toMatchObject({
      payload: {
        title: "run command",
        options: [{ optionId: "allow", name: "Allow", kind: "allow_once" }],
      },
    });
    const requestId = (request?.payload as { requestId: string }).requestId;

    handlePermissionResponse({ requestId, optionId: "allow" });
    await expect(pending).resolves.toBe("allow");
  });

  it("resolves null on deny", async () => {
    const port = makePort();
    const pending = requestPermissionFromUser(port, { title: "t", options: [] });
    const request = port.posted.find((envelope) => envelope.type === "permission.request");
    const requestId = (request?.payload as { requestId: string }).requestId;
    handlePermissionResponse({ requestId, optionId: null });
    await expect(pending).resolves.toBeNull();
  });

  it("resolves null on timeout", async () => {
    vi.useFakeTimers();
    const port = makePort();
    const pending = requestPermissionFromUser(port, { title: "t", options: [] }, 1000);
    const assertion = expect(pending).resolves.toBeNull();
    await vi.advanceTimersByTimeAsync(1001);
    await assertion;
    vi.useRealTimers();
  });

  it("ignores responses for unknown request ids", () => {
    expect(() => handlePermissionResponse({ requestId: "nope", optionId: "x" })).not.toThrow();
  });
});
