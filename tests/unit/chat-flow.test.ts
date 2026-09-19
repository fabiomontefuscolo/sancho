import { beforeEach, describe, expect, it, vi } from "vitest";
import { installMockChrome } from "./helpers/mock-chrome";
import { BaseLLMProvider, type StreamEvents } from "../../src/providers/base";

vi.mock("../../src/providers/factory", async () => {
  const actual = await vi.importActual<typeof import("../../src/providers/factory")>(
    "../../src/providers/factory",
  );
  return {
    ...actual,
    createProvider: vi.fn(),
  };
});

import { createProvider } from "../../src/providers/factory";
import { handleChatSend } from "../../src/agent/chat-handler";
import { getConversation } from "../../src/storage/local";
import type { AnyEnvelope } from "../../src/bridge/messages";

class EchoProvider extends BaseLLMProvider {
  readonly id = "echo";
  async streamChat(
    messages: { role: string; content: string }[],
    _tools: never[],
    events: StreamEvents,
  ) {
    events.onDelta(`echo: ${messages[messages.length - 1]?.content}`);
    events.onDone();
  }
}

function makePort() {
  const posted: AnyEnvelope[] = [];
  return {
    posted,
    postMessage: (message: unknown) => posted.push(message as AnyEnvelope),
  } as unknown as chrome.runtime.Port & { posted: AnyEnvelope[] };
}

describe("chat.send flow", () => {
  beforeEach(() => {
    installMockChrome();
    vi.mocked(createProvider).mockResolvedValue(new EchoProvider());
  });

  it("streams a reply and persists user + assistant messages", async () => {
    const port = makePort();
    await handleChatSend({ text: "hello", tabId: 1 }, port);

    expect(
      port.posted.some(
        (envelope) =>
          envelope.type === "chat.delta" &&
          typeof envelope.payload.text === "string" &&
          envelope.payload.text.startsWith("echo: [") &&
          envelope.payload.text.endsWith("] hello"),
      ),
    ).toBe(true);
    expect(port.posted.some((envelope) => envelope.type === "chat.done")).toBe(true);

    const conversation = await getConversation();
    expect(conversation.messages).toHaveLength(2);
    expect(conversation.messages[1]?.role).toBe("assistant");
  });

  it("prepends a system clock message with the active tab context", async () => {
    let received: { role: string; content: string }[] = [];
    class InspectProvider extends BaseLLMProvider {
      readonly id = "inspect";
      async streamChat(
        messages: { role: string; content: string }[],
        _tools: never[],
        events: StreamEvents,
      ) {
        received = messages;
        events.onDelta("ok");
        events.onDone();
      }
    }
    vi.mocked(createProvider).mockResolvedValue(new InspectProvider());
    const port = makePort();
    await handleChatSend({ text: "hi", tabId: 1 }, port);

    expect(received[0]?.role).toBe("system");
    expect(received[0]?.content).toContain("Current local time:");
    expect(received[0]?.content).toContain("UTC");
    expect(received[1]?.content).toMatch(/^\[\d{2}:\d{2}\] hi$/);
  });

  it("emits chat.error when no provider is configured", async () => {
    vi.mocked(createProvider).mockRejectedValue(new Error("no provider configured"));
    const port = makePort();
    await handleChatSend({ text: "hello", tabId: 1 }, port);
    expect(
      port.posted.some(
        (envelope) =>
          envelope.type === "chat.error" &&
          envelope.payload.message.includes("no provider configured"),
      ),
    ).toBe(true);
  });
});
