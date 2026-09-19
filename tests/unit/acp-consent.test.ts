import { beforeEach, describe, expect, it, vi } from "vitest";
import { installMockChrome } from "./helpers/mock-chrome";

interface CapturedHandlers {
  tool?:
    | ((request: { name: string; arguments: Record<string, unknown> }) => Promise<unknown>)
    | undefined;
  permission?: unknown;
}

vi.mock("../../src/providers/acp", () => {
  class MockAcpProvider {
    readonly id = "acp";
    handlers: CapturedHandlers = {};
    useConversation(): void {}
    setSessionCreatedHandler(): void {}
    setPermissionHandler(handler: unknown): void {
      this.handlers.permission = handler;
    }
    setToolInvokeHandler(handler: CapturedHandlers["tool"]): void {
      this.handlers.tool = handler ?? undefined;
    }
    async streamChat(
      _messages: unknown[],
      _tools: unknown[],
      events: { onDone(): void },
    ): Promise<void> {
      events.onDone();
    }
  }
  return { AcpProvider: MockAcpProvider };
});

vi.mock("../../src/providers/factory", async () => {
  const actual = await vi.importActual<typeof import("../../src/providers/factory")>(
    "../../src/providers/factory",
  );
  return { ...actual, createProvider: vi.fn() };
});

import { AcpProvider } from "../../src/providers/acp";
import { createProvider } from "../../src/providers/factory";
import { handleChatSend } from "../../src/agent/chat-handler";
import { createConversation } from "../../src/storage/conversations";
import type { AnyEnvelope } from "../../src/bridge/messages";

function makePort() {
  const posted: AnyEnvelope[] = [];
  return {
    posted,
    postMessage: (message: unknown) => posted.push(message as AnyEnvelope),
  } as unknown as chrome.runtime.Port & { posted: AnyEnvelope[] };
}

describe("ACP tool invoke consent surfacing", () => {
  beforeEach(() => {
    installMockChrome();
  });

  it("posts consent_required when the agent's screenshot tool call is blocked", async () => {
    const provider = new AcpProvider({ hostName: "mock.host" } as never);
    vi.mocked(createProvider).mockResolvedValue(provider as never);
    const conversation = await createConversation();
    const port = makePort();

    await handleChatSend(
      { text: "take a screenshot", tabId: 1, conversationId: conversation.id },
      port,
    );

    const toolHandler = (provider as unknown as { handlers: CapturedHandlers }).handlers.tool;
    expect(toolHandler).toBeTypeOf("function");
    const result = (await toolHandler?.({
      name: "captureScreenshot",
      arguments: {},
    })) as { ok: boolean; error: string };

    expect(result).toMatchObject({ ok: false, error: "consent_required" });
    expect(
      port.posted.some(
        (envelope) =>
          envelope.type === "chat.error" &&
          envelope.payload.message === "consent_required" &&
          envelope.payload.conversationId === conversation.id,
      ),
    ).toBe(true);
  });
});
