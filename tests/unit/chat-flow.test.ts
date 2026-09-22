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
import { handleChatRegenerate, handleChatSend } from "../../src/agent/chat-handler";
import {
  createConversation,
  getActiveConversation,
  saveConversationRecord,
} from "../../src/storage/conversations";
import { saveCustomInstructions } from "../../src/storage/settings";
import type { AnyEnvelope } from "../../src/bridge/messages";
import type { Message } from "../../src/types";

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
    await handleChatSend({ text: "hello", tabId: 1, conversationId: "c1" }, port);

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

    const conversation = await getActiveConversation();
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
    await handleChatSend({ text: "hi", tabId: 1, conversationId: "c1" }, port);

    expect(received[0]?.role).toBe("system");
    expect(received[0]?.content).toContain("Current local time:");
    expect(received[0]?.content).toContain("UTC");
    expect(received[1]?.content).toMatch(/^\[\d{2}:\d{2}\] hi$/);
  });

  function makeInspectProvider(received: { role: string; content: string }[]) {
    return new (class extends BaseLLMProvider {
      readonly id = "inspect";
      async streamChat(
        messages: { role: string; content: string }[],
        _tools: never[],
        events: StreamEvents,
      ) {
        received.push(...messages);
        events.onDelta("ok");
        events.onDone();
      }
    })();
  }

  it("prepends custom instructions before the clock message when set", async () => {
    await saveCustomInstructions("always reply in Portuguese");
    const received: { role: string; content: string }[] = [];
    vi.mocked(createProvider).mockResolvedValue(makeInspectProvider(received));
    const port = makePort();
    await handleChatSend({ text: "hi", tabId: 1, conversationId: "c1" }, port);

    expect(received[0]?.role).toBe("system");
    expect(received[0]?.content).toBe(
      "Custom instructions from the user (follow these in every reply):\nalways reply in Portuguese",
    );
    expect(received[1]?.role).toBe("system");
    expect(received[1]?.content).toContain("Current local time:");
    expect(
      received.filter(
        (message) => message.role === "system" && message.content.startsWith("Custom instructions"),
      ),
    ).toHaveLength(1);
  });

  it("sends no instructions message when custom instructions are unset or whitespace", async () => {
    const received: { role: string; content: string }[] = [];
    vi.mocked(createProvider).mockResolvedValue(makeInspectProvider(received));
    const port = makePort();
    await handleChatSend({ text: "hi", tabId: 1, conversationId: "c1" }, port);

    expect(received[0]?.role).toBe("system");
    expect(received[0]?.content).toContain("Current local time:");
    expect(received.some((message) => message.content.startsWith("Custom instructions"))).toBe(
      false,
    );
  });

  it("does not persist custom instructions into the conversation history", async () => {
    await saveCustomInstructions("be terse");
    const port = makePort();
    await handleChatSend({ text: "hi", tabId: 1, conversationId: "c1" }, port);

    const conversation = await getActiveConversation();
    const texts = conversation.messages.flatMap((message) =>
      message.parts.map((part) => (part.type === "text" ? part.text : "")),
    );
    expect(texts.some((text) => text.includes("be terse"))).toBe(false);
  });

  it("picks up edited custom instructions on the next turn", async () => {
    await saveCustomInstructions("instructions A");
    const runs: { role: string; content: string }[][] = [];
    vi.mocked(createProvider).mockImplementation(async () => {
      const received: { role: string; content: string }[] = [];
      runs.push(received);
      return makeInspectProvider(received);
    });
    const port = makePort();
    await handleChatSend({ text: "one", tabId: 1, conversationId: "c1" }, port);
    await saveCustomInstructions("instructions B");
    await handleChatSend({ text: "two", tabId: 1, conversationId: "c1" }, port);

    expect(runs[0]?.[0]?.content).toContain("instructions A");
    expect(runs[1]?.[0]?.content).toContain("instructions B");
  });

  it("emits chat.error when no provider is configured", async () => {
    vi.mocked(createProvider).mockRejectedValue(new Error("no provider configured"));
    const port = makePort();
    await handleChatSend({ text: "hello", tabId: 1, conversationId: "c1" }, port);
    expect(
      port.posted.some(
        (envelope) =>
          envelope.type === "chat.error" &&
          envelope.payload.message.includes("no provider configured"),
      ),
    ).toBe(true);
  });
});

describe("chat.regenerate flow", () => {
  beforeEach(() => {
    installMockChrome();
    vi.mocked(createProvider).mockResolvedValue(new EchoProvider());
  });

  function seedConversation(messages: Message[]): Promise<string> {
    return createConversation().then(async (conversation) => {
      conversation.messages.push(...messages);
      await saveConversationRecord(conversation);
      return conversation.id;
    });
  }

  const userMessage = (text: string): Message => ({
    id: crypto.randomUUID(),
    role: "user",
    parts: [{ type: "text", text }],
    tabId: 1,
    createdAt: Date.now(),
  });
  const assistantMessage = (text: string): Message => ({
    id: crypto.randomUUID(),
    role: "assistant",
    parts: [{ type: "text", text }],
    tabId: 1,
    createdAt: Date.now(),
  });

  it("truncates assistant messages after the last user message and re-runs", async () => {
    await seedConversation([
      userMessage("first"),
      assistantMessage("old answer"),
      userMessage("second"),
      assistantMessage("stale answer"),
    ]);
    const port = makePort();
    await handleChatRegenerate(port);

    const conversation = await getActiveConversation();
    expect(conversation.messages.map((message) => message.role)).toEqual([
      "user",
      "assistant",
      "user",
      "assistant",
    ]);
    expect(conversation.messages[2]?.parts[0]).toEqual({ type: "text", text: "second" });
    const last = conversation.messages[3];
    expect(last?.parts[0]).toMatchObject({ type: "text" });
    expect((last?.parts[0] as { text: string }).text).toContain("second");
    expect(port.posted.some((envelope) => envelope.type === "chat.delta")).toBe(true);
    expect(port.posted.some((envelope) => envelope.type === "chat.done")).toBe(true);
  });

  it("behaves as a resend when the last message is from the user", async () => {
    await seedConversation([userMessage("only user")]);
    const port = makePort();
    await handleChatRegenerate(port);

    const conversation = await getActiveConversation();
    expect(conversation.messages.map((message) => message.role)).toEqual(["user", "assistant"]);
  });

  it("is a no-op when the conversation has no user message", async () => {
    await seedConversation([]);
    const port = makePort();
    await handleChatRegenerate(port);

    const conversation = await getActiveConversation();
    expect(conversation.messages).toHaveLength(0);
    expect(port.posted.some((envelope) => envelope.type === "chat.delta")).toBe(false);
    expect(port.posted.some((envelope) => envelope.type === "chat.done")).toBe(false);
  });
});
