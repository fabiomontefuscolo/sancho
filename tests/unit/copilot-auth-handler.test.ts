import { beforeEach, describe, expect, it, vi } from "vitest";
import { installMockChrome } from "./helpers/mock-chrome";
import { makeCopilotAuthHandlers } from "../../src/agent/copilot-auth-handler";
import { loadCopilotAuth, saveCopilotAuth, type DeviceFlowStart } from "../../src/auth/copilot";
import type { CopilotAuthStatePayload, CopilotModelsPayload } from "../../src/bridge/messages";

const FLOW: DeviceFlowStart = {
  deviceCode: "dc",
  userCode: "ABCD-EFGH",
  verificationUri: "https://github.com/login/device",
  interval: 5,
  expiresIn: 900,
};

function fakePort() {
  const postMessage = vi.fn();
  let disconnectListener: (() => void) | null = null;
  const port = {
    postMessage,
    onDisconnect: {
      addListener: vi.fn((listener: () => void) => {
        disconnectListener = listener;
      }),
      removeListener: vi.fn(),
    },
  } as unknown as chrome.runtime.Port;
  const disconnect = () => disconnectListener?.();
  const states = () =>
    postMessage.mock.calls
      .map((call) => call[0] as { type: string; payload: unknown })
      .filter((msg) => msg.type === "copilot.auth.state")
      .map((msg) => msg.payload as CopilotAuthStatePayload);
  const models = () =>
    postMessage.mock.calls
      .map((call) => call[0] as { type: string; payload: unknown })
      .filter((msg) => msg.type === "copilot.models.state")
      .map((msg) => msg.payload as CopilotModelsPayload);
  return { port, postMessage, states, models, disconnect };
}

describe("copilot auth handlers", () => {
  beforeEach(() => installMockChrome());

  it("start emits pending then connected and stores the token", async () => {
    const { port, states } = fakePort();
    const handlers = makeCopilotAuthHandlers({
      startFlow: vi.fn().mockResolvedValue(FLOW),
      pollFlow: vi.fn().mockResolvedValue("gho_abc"),
    });
    await handlers.handleStart(port);
    expect(states()).toEqual([
      { status: "pending", userCode: "ABCD-EFGH", verificationUri: FLOW.verificationUri },
      { status: "connected" },
    ]);
    expect((await loadCopilotAuth())?.githubToken).toBe("gho_abc");
  });

  it("start emits pending then error when polling fails", async () => {
    const { port, states } = fakePort();
    const handlers = makeCopilotAuthHandlers({
      startFlow: vi.fn().mockResolvedValue(FLOW),
      pollFlow: vi.fn().mockRejectedValue(new Error("authorization denied on GitHub")),
    });
    await handlers.handleStart(port);
    expect(states().at(-1)).toEqual({ status: "error", message: "authorization denied on GitHub" });
    expect(await loadCopilotAuth()).toBeNull();
  });

  it("aborts the pending flow silently when the port disconnects", async () => {
    const { port, states, disconnect } = fakePort();
    const handlers = makeCopilotAuthHandlers({
      startFlow: vi.fn().mockResolvedValue(FLOW),
      pollFlow: vi.fn().mockImplementation(
        (_flow: DeviceFlowStart, { signal }: { signal: AbortSignal }) =>
          new Promise<string>((_resolve, reject) => {
            signal.addEventListener("abort", () => reject(new Error("authorization aborted")));
          }),
      ),
    });
    const started = handlers.handleStart(port);
    await vi.waitFor(() =>
      expect(states()).toContainEqual({
        status: "pending",
        userCode: "ABCD-EFGH",
        verificationUri: FLOW.verificationUri,
      }),
    );
    disconnect();
    await started;
    expect(states().some((s) => s.status === "error")).toBe(false);
    await handlers.handleStatus(port);
    expect(states().at(-1)).toEqual({ status: "disconnected" });
    expect(await loadCopilotAuth()).toBeNull();
  });

  it("status reports connected from persisted auth, disconnected otherwise", async () => {
    const { port, states, postMessage } = fakePort();
    const handlers = makeCopilotAuthHandlers({});
    await handlers.handleStatus(port);
    expect(states()).toEqual([{ status: "disconnected" }]);
    postMessage.mockClear();
    await saveCopilotAuth({ githubToken: "gho_abc" });
    await handlers.handleStatus(port);
    expect(states()).toEqual([{ status: "connected" }]);
  });

  it("disconnect clears stored auth and reports disconnected", async () => {
    const { port, states } = fakePort();
    const handlers = makeCopilotAuthHandlers({});
    await saveCopilotAuth({ githubToken: "gho_abc" });
    await handlers.handleDisconnect(port);
    expect(await loadCopilotAuth()).toBeNull();
    expect(states()).toEqual([{ status: "disconnected" }]);
  });

  it("models emits the list, or an error payload on failure", async () => {
    const { port, models, postMessage } = fakePort();
    const handlers = makeCopilotAuthHandlers({
      listModels: vi.fn().mockResolvedValue(["gpt-4.1"]),
    });
    await handlers.handleModels(port);
    expect(models()).toEqual([{ models: ["gpt-4.1"] }]);
    postMessage.mockClear();
    const failing = makeCopilotAuthHandlers({
      listModels: vi.fn().mockRejectedValue(new Error("boom")),
    });
    await failing.handleModels(port);
    expect(models()).toEqual([{ models: [], error: "boom" }]);
  });
});
