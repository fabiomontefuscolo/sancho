import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installMockChrome } from "./helpers/mock-chrome";
import { BaseLLMProvider, type StreamEvents } from "../../src/providers/base";

vi.mock("../../src/providers/factory", async () => {
  const actual = await vi.importActual<typeof import("../../src/providers/factory")>(
    "../../src/providers/factory",
  );
  return { ...actual, createProvider: vi.fn() };
});

import { createProvider } from "../../src/providers/factory";
import { handleChatSend, RUN_WATCHDOG_MS, WATCHDOG_MESSAGE } from "../../src/agent/chat-handler";
import { createConversation } from "../../src/storage/conversations";
import type { AnyEnvelope } from "../../src/bridge/messages";

class SilentProvider extends BaseLLMProvider {
  readonly id = "silent";
  async streamChat(
    _messages: { role: string; content: string }[],
    _tools: never[],
    events: StreamEvents,
  ) {
    const onDone = events.onDone;
    await new Promise<void>((resolve) => {
      const timer = setInterval(() => {
        void 0;
      }, 1000);
      setTimeout(() => {
        clearInterval(timer);
        onDone();
        resolve();
      }, 120_000);
    });
  }
}

class ChattyProvider extends BaseLLMProvider {
  readonly id = "chatty";
  async streamChat(
    _messages: { role: string; content: string }[],
    _tools: never[],
    events: StreamEvents,
  ) {
    for (let i = 0; i < 3; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 40_000));
      events.onDelta(`chunk ${i} `);
    }
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

describe("run watchdog", () => {
  beforeEach(() => {
    installMockChrome();
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  it("posts an error and aborts when the agent is silent for too long", async () => {
    vi.mocked(createProvider).mockResolvedValue(new SilentProvider());
    const conversation = await createConversation();
    const port = makePort();
    const run = handleChatSend({ text: "hello", tabId: 1, conversationId: conversation.id }, port);
    await vi.advanceTimersByTimeAsync(RUN_WATCHDOG_MS + 100);
    expect(
      port.posted.some(
        (envelope) =>
          envelope.type === "chat.error" &&
          envelope.payload.message === WATCHDOG_MESSAGE &&
          envelope.payload.conversationId === conversation.id,
      ),
    ).toBe(true);
    await vi.advanceTimersByTimeAsync(120_000);
    await run;
  });

  it("does not fire while the agent keeps making progress", async () => {
    vi.mocked(createProvider).mockResolvedValue(new ChattyProvider());
    const conversation = await createConversation();
    const port = makePort();
    const run = handleChatSend({ text: "hello", tabId: 1, conversationId: conversation.id }, port);
    await vi.advanceTimersByTimeAsync(130_000);
    await run;
    expect(
      port.posted.some(
        (envelope) =>
          envelope.type === "chat.error" && envelope.payload.message === WATCHDOG_MESSAGE,
      ),
    ).toBe(false);
    expect(port.posted.some((envelope) => envelope.type === "chat.done")).toBe(true);
  });
});
