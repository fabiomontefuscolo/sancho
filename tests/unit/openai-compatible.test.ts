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

function sseReasoningBody(reasoning: string, text: string): string {
  const reasoningChunk = {
    id: "x",
    object: "chat.completion.chunk",
    created: 0,
    model: "m",
    choices: [{ index: 0, delta: { reasoning_content: reasoning }, finish_reason: null }],
  };
  const textChunk = {
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
  return `data: ${JSON.stringify(reasoningChunk)}\n\ndata: ${JSON.stringify(textChunk)}\n\ndata: ${JSON.stringify(done)}\n\ndata: [DONE]\n\n`;
}

function collect() {
  const deltas: string[] = [];
  const reasoning: string[] = [];
  let done = false;
  let error: Error | null = null;
  const events: StreamEvents = {
    onDelta: (text) => deltas.push(text),
    onReasoningDelta: (text) => reasoning.push(text),
    onToolCall: () => {},
    onDone: () => {
      done = true;
    },
    onError: (err) => {
      error = err;
    },
  };
  return { events, deltas, reasoning, isDone: () => done, getError: () => error };
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

  it("sends custom headers on the wire request", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(sseBody("ok"), { status: 200 })),
    );
    const provider = new OpenAICompatibleProvider({
      providerId: "copilot",
      baseUrl: "https://api.githubcopilot.com",
      model: "gpt-4.1",
      apiKey: "session-token",
      headers: {
        "copilot-integration-id": "vscode-chat",
        "openai-intent": "conversation-panel",
      },
    });
    const { events, isDone } = collect();
    await provider.streamChat([{ role: "user", content: "hi" }], [], events);
    expect(isDone()).toBe(true);
    const init = vi.mocked(fetch).mock.calls[0]?.[1];
    const headers = new Headers(init?.headers);
    expect(headers.get("copilot-integration-id")).toBe("vscode-chat");
    expect(headers.get("openai-intent")).toBe("conversation-panel");
    expect(headers.get("authorization")).toBe("Bearer session-token");
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

  it("extracts reasoning_content deltas into onReasoningDelta", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(sseReasoningBody("thinking hard", "answer"), { status: 200 })),
    );
    const provider = new OpenAICompatibleProvider({
      providerId: "custom",
      baseUrl: "http://127.0.0.1:9/v1",
      model: "m",
      apiKey: "sk-x",
    });
    const { events, deltas, reasoning, isDone } = collect();
    await provider.streamChat([{ role: "user", content: "hi" }], [], events);
    expect(reasoning).toEqual(["thinking hard"]);
    expect(deltas).toEqual(["answer"]);
    expect(isDone()).toBe(true);
  });

  it("never calls onReasoningDelta when the stream has no reasoning", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(sseBody("plain"), { status: 200 })),
    );
    const provider = new OpenAICompatibleProvider({
      providerId: "custom",
      baseUrl: "http://127.0.0.1:9/v1",
      model: "m",
      apiKey: "sk-x",
    });
    const { events, deltas, reasoning } = collect();
    await provider.streamChat([{ role: "user", content: "hi" }], [], events);
    expect(deltas).toEqual(["plain"]);
    expect(reasoning).toEqual([]);
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
