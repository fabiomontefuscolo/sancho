import { beforeEach, describe, expect, it, vi } from "vitest";
import { installMockChrome } from "./helpers/mock-chrome";

interface PromptCall {
  sessionId: string;
  text: string;
}

vi.mock("@agentclientprotocol/sdk", () => {
  class FakeConnection {
    static instances: FakeConnection[] = [];
    static failNextPrompts = 0;
    promptCalls: PromptCall[] = [];
    newSessionCalls = 0;

    constructor(
      public handlerFactory: unknown,
      public stream: unknown,
    ) {
      FakeConnection.instances.push(this);
    }

    async initialize(): Promise<void> {}

    async newSession(): Promise<{ sessionId: string }> {
      this.newSessionCalls += 1;
      return { sessionId: `ses-new-${this.newSessionCalls}` };
    }

    async prompt(params: {
      sessionId: string;
      prompt: Array<{ type: string; text: string }>;
    }): Promise<void> {
      this.promptCalls.push({ sessionId: params.sessionId, text: params.prompt[0]?.text ?? "" });
      if (FakeConnection.failNextPrompts > 0) {
        FakeConnection.failNextPrompts -= 1;
        throw new Error(`Invalid params: session not found: ${params.sessionId}`);
      }
    }

    async cancel(): Promise<void> {}
  }
  return {
    ClientSideConnection: FakeConnection,
    ndJsonStream: () => ({}),
    PROTOCOL_VERSION: 1,
  };
});

vi.mock("../../src/providers/acp-transport", async () => {
  const actual = await vi.importActual<typeof import("../../src/providers/acp-transport")>(
    "../../src/providers/acp-transport",
  );
  return {
    ...actual,
    openNativePort: vi.fn(() => ({
      postMessage: () => {},
      onMessage: { addListener: () => {} },
      onDisconnect: { addListener: () => {} },
      disconnect: () => {},
    })),
    connectAcpHost: vi.fn(async (port: unknown) => ({ port, mcpServer: null })),
  };
});

import { ClientSideConnection } from "@agentclientprotocol/sdk";
import { AcpProvider } from "../../src/providers/acp";

const Fake = ClientSideConnection as unknown as {
  instances: Array<{
    promptCalls: Array<{ sessionId: string; text: string }>;
    newSessionCalls: number;
  }>;
  failNextPrompts: number;
};

const MESSAGES = [
  { role: "user" as const, content: "[10:00] earlier context" },
  { role: "assistant" as const, content: "[10:01] previous answer" },
  { role: "user" as const, content: "[10:02] latest question" },
];

function makeEvents() {
  return {
    onDelta: vi.fn(),
    onDone: vi.fn(),
    onError: vi.fn(),
    onToolCall: vi.fn(),
  };
}

describe("ACP stale session retry", () => {
  beforeEach(() => {
    installMockChrome();
    Fake.instances = [];
    Fake.failNextPrompts = 0;
  });

  it("drops the stale session and retries once with a fresh session and rebuilt context", async () => {
    Fake.failNextPrompts = 1;
    const provider = new AcpProvider({ hostName: "mock.host" });
    const onInvalid = vi.fn();
    const onCreated = vi.fn();
    provider.setSessionInvalidHandler(onInvalid);
    provider.setSessionCreatedHandler(onCreated);
    provider.useConversation("conv-1", "ses-stale");

    const events = makeEvents();
    await provider.streamChat(MESSAGES, [], events);

    const connection = Fake.instances[0];
    if (!connection) throw new Error("no connection");
    expect(connection.promptCalls.map((call) => call.sessionId)).toEqual([
      "ses-stale",
      "ses-new-1",
    ]);
    expect(onInvalid).toHaveBeenCalledWith("conv-1");
    expect(onCreated).toHaveBeenCalledWith("ses-new-1");
    expect(connection.newSessionCalls).toBe(1);

    const retryText = connection.promptCalls[1]?.text ?? "";
    expect(retryText).toContain("previous session was reset");
    expect(retryText).toContain("earlier context");
    expect(retryText).toContain("previous answer");
    expect(retryText).toContain("latest question");
    expect(events.onDone).toHaveBeenCalled();
    expect(events.onError).not.toHaveBeenCalled();
  });

  it("fails after exactly one retry when the fresh session is also rejected", async () => {
    Fake.failNextPrompts = 2;
    const provider = new AcpProvider({ hostName: "mock.host" });
    provider.useConversation("conv-1", "ses-stale");

    const events = makeEvents();
    await provider.streamChat(MESSAGES, [], events);

    const connection = Fake.instances[0];
    if (!connection) throw new Error("no connection");
    expect(connection.promptCalls).toHaveLength(2);
    expect(connection.newSessionCalls).toBe(1);
    expect(events.onError).toHaveBeenCalledTimes(1);
    expect(events.onDone).not.toHaveBeenCalled();
  });

  it("does not retry for non-session errors", async () => {
    const provider = new AcpProvider({ hostName: "mock.host" });
    provider.useConversation("conv-1", "ses-stale");
    const events = makeEvents();
    Fake.failNextPrompts = 0;
    await provider.streamChat(MESSAGES, [], events);
    expect(events.onDone).toHaveBeenCalled();
  });
});
