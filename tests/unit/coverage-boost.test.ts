import { beforeEach, describe, expect, it, vi } from "vitest";
import { installMockChrome } from "./helpers/mock-chrome";
import { ensureContentScript, RestrictedPageError, sendToContent } from "../../src/agent/inject";
import { AcpProvider } from "../../src/providers/acp";
import { handleChatSend } from "../../src/agent/chat-handler";
import { BaseLLMProvider, type StreamEvents } from "../../src/providers/base";
import { createProvider } from "../../src/providers/factory";
import type { AnyEnvelope } from "../../src/bridge/messages";

vi.mock("../../src/providers/factory", async () => {
  const actual = await vi.importActual<typeof import("../../src/providers/factory")>(
    "../../src/providers/factory",
  );
  return { ...actual, createProvider: vi.fn() };
});

describe("inject", () => {
  beforeEach(() => installMockChrome());

  it("raises RestrictedPageError when injection fails", async () => {
    const { chromeMock } = installMockChrome();
    chromeMock.scripting.executeScript.mockRejectedValueOnce(new Error("cannot inject"));
    await expect(ensureContentScript(42)).rejects.toBeInstanceOf(RestrictedPageError);
  });

  it("sends messages after ensuring injection", async () => {
    const { chromeMock } = installMockChrome();
    const result = await sendToContent(1, { type: "page.fill", selector: "#a", value: "v" });
    expect(result).toEqual({ ok: true });
    expect(chromeMock.scripting.executeScript).toHaveBeenCalled();
  });
});

class ToolCallingProvider extends BaseLLMProvider {
  readonly id = "tooling";
  calls = 0;
  async streamChat(_m: never[], _t: never[], events: StreamEvents) {
    this.calls += 1;
    if (this.calls === 1) {
      events.onToolCall({ name: "readPage", arguments: {}, tabId: 1 });
    } else {
      events.onDelta("read the page for you");
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

describe("AcpProvider failure path", () => {
  beforeEach(() => installMockChrome());

  it("reports host-unavailable via onError and resets state", async () => {
    const provider = new AcpProvider({ hostName: "missing-host" });
    let failure: Error | null = null;
    await provider.streamChat([{ role: "user", content: "hi" }], [], {
      onDelta: () => {},
      onToolCall: () => {},
      onDone: () => {},
      onError: (error) => {
        failure = error;
      },
    });
    expect(failure).toBeTruthy();
    expect((failure as unknown as Error).message).toContain("native messaging host");
  });
});

describe("chat.send with tool call", () => {
  beforeEach(() => installMockChrome());

  it("executes tools, reports activity, and completes", async () => {
    vi.mocked(createProvider).mockResolvedValue(new ToolCallingProvider());
    const port = makePort();
    await handleChatSend({ text: "read it", tabId: 1 }, port);

    const toolEvents = port.posted.filter((envelope) => envelope.type === "chat.tool");
    expect(toolEvents.map((envelope) => envelope.payload.status)).toEqual(["started", "finished"]);
    expect(
      port.posted.some(
        (envelope) =>
          envelope.type === "chat.delta" && envelope.payload.text.includes("read the page"),
      ),
    ).toBe(true);
  });

  it("appends screenshot image messages when consent is granted", async () => {
    const { saveConversation, getConversation } = await import("../../src/storage/local");
    const conversation = await getConversation();
    conversation.screenshotConsent = true;
    await saveConversation(conversation);

    class ScreenshotProvider extends BaseLLMProvider {
      readonly id = "shot";
      calls = 0;
      async streamChat(_m: never[], _t: never[], events: StreamEvents) {
        this.calls += 1;
        if (this.calls === 1) {
          events.onToolCall({ name: "captureScreenshot", arguments: {}, tabId: 1 });
        } else {
          events.onDelta("I see it");
        }
        events.onDone();
      }
    }
    vi.mocked(createProvider).mockResolvedValue(new ScreenshotProvider());
    const port = makePort();
    await handleChatSend({ text: "look", tabId: 1 }, port);

    const updated = await getConversation();
    expect(
      updated.messages.some((message) => message.parts.some((part) => part.type === "image")),
    ).toBe(true);
  });

  it("prompts for consent when a screenshot is blocked", async () => {
    class BlockedProvider extends BaseLLMProvider {
      readonly id = "blocked";
      calls = 0;
      async streamChat(_m: never[], _t: never[], events: StreamEvents) {
        this.calls += 1;
        if (this.calls === 1) {
          events.onToolCall({ name: "captureScreenshot", arguments: {}, tabId: 1 });
        } else {
          events.onDelta("cannot see");
        }
        events.onDone();
      }
    }
    vi.mocked(createProvider).mockResolvedValue(new BlockedProvider());
    const port = makePort();
    await handleChatSend({ text: "look", tabId: 1 }, port);
    expect(
      port.posted.some(
        (envelope) =>
          envelope.type === "chat.error" && envelope.payload.message === "consent_required",
      ),
    ).toBe(true);
  });

  it("chat.cancel aborts and reports cancellation", async () => {
    const { handleChatCancel } = await import("../../src/agent/chat-handler");
    const port = makePort();
    await handleChatCancel(port);
    expect(
      port.posted.some(
        (envelope) => envelope.type === "chat.done" && envelope.payload.cancelled === true,
      ),
    ).toBe(true);
  });

  it("reports restricted pages as tool errors without crashing", async () => {
    const { chromeMock } = installMockChrome();
    chromeMock.scripting.executeScript.mockRejectedValue(new Error("cannot inject"));
    vi.mocked(createProvider).mockResolvedValue(new ToolCallingProvider());
    const port = makePort();
    await handleChatSend({ text: "read it", tabId: 1 }, port);
    expect(port.posted.some((envelope) => envelope.type === "chat.done")).toBe(true);
  });
});
