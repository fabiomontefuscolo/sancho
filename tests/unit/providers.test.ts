import { describe, expect, it } from "vitest";
import {
  BaseLLMProvider,
  type ProviderMessage,
  type StreamEvents,
  type ToolDefinition,
} from "../../src/providers/base";
import { z } from "zod";

class FakeProvider extends BaseLLMProvider {
  readonly id = "fake";
  lastMessages: ProviderMessage[] = [];
  lastTools: ToolDefinition[] = [];

  async streamChat(
    messages: ProviderMessage[],
    tools: ToolDefinition[],
    events: StreamEvents,
  ): Promise<void> {
    this.lastMessages = messages;
    this.lastTools = tools;
    events.onDelta("hello");
    events.onDelta(" world");
    events.onToolCall({ name: "readPage", arguments: {}, tabId: 3 });
    events.onDone();
  }
}

function collectEvents() {
  const deltas: string[] = [];
  const toolCalls: string[] = [];
  let done = false;
  const events: StreamEvents = {
    onDelta: (text) => deltas.push(text),
    onToolCall: (call) => toolCalls.push(call.name),
    onDone: () => {
      done = true;
    },
    onError: () => {},
  };
  return { events, deltas, toolCalls, isDone: () => done };
}

describe("BaseLLMProvider contract", () => {
  it("streams deltas and tool calls through a uniform event surface", async () => {
    const provider = new FakeProvider();
    const { events, deltas, toolCalls, isDone } = collectEvents();
    const messages: ProviderMessage[] = [{ role: "user", content: "summarize" }];
    const tools: ToolDefinition[] = [
      { name: "readPage", description: "read the page", parameters: z.object({}) },
    ];

    await provider.streamChat(messages, tools, events);

    expect(deltas).toEqual(["hello", " world"]);
    expect(toolCalls).toEqual(["readPage"]);
    expect(isDone()).toBe(true);
  });

  it("exposes a stable provider id", () => {
    expect(new FakeProvider().id).toBe("fake");
  });

  it("converts a tool definition to the wire tool format with JSON schema parameters", () => {
    const provider = new FakeProvider();
    const wire = provider.toWireTool({
      name: "fillField",
      description: "fill a field",
      parameters: z.object({ selector: z.string(), value: z.string() }),
    });
    expect(wire.name).toBe("fillField");
    expect(wire.description).toBe("fill a field");
    expect(wire.parametersJsonSchema).toMatchObject({
      type: "object",
      properties: { selector: { type: "string" }, value: { type: "string" } },
    });
  });
});
