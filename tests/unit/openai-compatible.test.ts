import { afterEach, describe, expect, it, vi } from "vitest";
import { OpenAICompatibleProvider } from "../../src/providers/openai-compatible";
import type { StreamEvents } from "../../src/providers/base";

function sseBody(text: string): string {
  const chunk = {
    id: "x",
    object: "chat.completion.chunk",
    created: 0,
    model: "m",
    choices: [{ index: 0, delta: { content: text }, finish_reason: null }],
  };
  const done = {
    id: "x",
    object: "chat.completion.chunk",
    created: 0,
    model: "m",
    choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
  };
  return `data: ${JSON.stringify(chunk)}\n\ndata: ${JSON.stringify(done)}\n\ndata: [DONE]\n\n`;
}

function collect() {
  const deltas: string[] = [];
  let done = false;
  let error: Error | null = null;
  const events: StreamEvents = {
    onDelta: (text) => deltas.push(text),
    onToolCall: () => {},
    onDone: () => {
      done = true;
    },
    onError: (err) => {
      error = err;
    },
  };
  return { events, deltas, isDone: () => done, getError: () => error };
}

describe("OpenAICompatibleProvider", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("streams SSE deltas from the configured endpoint", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(sseBody("hello from mock"), { status: 200 })),
    );
    const provider = new OpenAICompatibleProvider({
      providerId: "custom",
      baseUrl: "http://127.0.0.1:9/v1",
      model: "m",
      apiKey: "sk-x",
    });
    const { events, deltas, isDone } = collect();
    await provider.streamChat([{ role: "user", content: "hi" }], [], events);
    expect(deltas).toEqual(["hello from mock"]);
    expect(isDone()).toBe(true);
    expect(vi.mocked(fetch).mock.calls[0]?.[0]).toBe("http://127.0.0.1:9/v1/chat/completions");
  });

  it("maps all message roles and image parts onto the wire format", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(sseBody("ok"), { status: 200 })),
    );
    const provider = new OpenAICompatibleProvider({
      providerId: "custom",
      baseUrl: "http://127.0.0.1:9/v1",
      model: "m",
      apiKey: "sk-x",
    });
    const { events } = collect();
    await provider.streamChat(
      [
        { role: "system", content: "be terse" },
        { role: "assistant", content: "earlier reply" },
        { role: "tool", content: '{"ok":true}', toolCallId: "readPage" },
        { role: "user", content: "look", imageBase64: "QUJD" },
      ],
      [],
      events,
    );
    const body = JSON.parse(String(vi.mocked(fetch).mock.calls[0]?.[1]?.body)) as {
      messages: Array<{ role: string; content: unknown }>;
    };
    expect(body.messages.map((message) => message.role)).toEqual([
      "system",
      "assistant",
      "tool",
      "user",
    ]);
    const userContent = body.messages[3]?.content as Array<{
      type: string;
      image_url?: { url: string };
    }>;
    expect(userContent[1]?.type).toBe("image_url");
  });

  it("surfaces HTTP failures via onError", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("unauthorized", { status: 401 })),
    );
    const provider = new OpenAICompatibleProvider({
      providerId: "custom",
      baseUrl: "http://127.0.0.1:9/v1",
      model: "m",
      apiKey: "bad",
    });
    const { events, getError } = collect();
    await provider.streamChat([{ role: "user", content: "hi" }], [], events);
    expect(getError()).toBeTruthy();
  });
});

describe("tool-call message conversion", () => {
  it("serializes assistant tool-calls and tool results as a valid sequence", async () => {
    const fetchMock = vi.fn(async () => new Response(sseBody("ok"), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const provider = new OpenAICompatibleProvider({
      providerId: "custom",
      baseUrl: "http://127.0.0.1:9/v1",
      model: "m",
      apiKey: "k",
    });
    const { events } = collect();

    await provider.streamChat(
      [
        { role: "user", content: "read the page" },
        {
          role: "assistant",
          content: "",
          toolCalls: [{ id: "call-1", name: "readPage", arguments: {}, tabId: 1 }],
        },
        {
          role: "tool",
          toolCallId: "call-1",
          toolName: "readPage",
          content: '{"ok":true}',
        },
      ],
      [],
      events,
    );

    const body = JSON.parse(
      ((fetchMock.mock.calls[0] as unknown[])[1] as { body: string }).body,
    ) as {
      messages: Array<Record<string, unknown>>;
    };
    const assistant = body.messages[1]!;
    const tool = body.messages[2]!;
    expect(assistant.tool_calls).toEqual([
      expect.objectContaining({ id: "call-1", type: "function" }),
    ]);
    expect(tool.role).toBe("tool");
    expect(tool.tool_call_id).toBe("call-1");
  });
});
