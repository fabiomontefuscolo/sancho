import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { streamText, type ModelMessage, type ToolSet } from "ai";
import { jsonSchema } from "ai";
import {
  BaseLLMProvider,
  type ProviderMessage,
  type StreamEvents,
  type ToolDefinition,
} from "./base";

export interface OpenAICompatibleOptions {
  providerId: string;
  baseUrl: string;
  model: string;
  apiKey: string;
}

export class OpenAICompatibleProvider extends BaseLLMProvider {
  readonly id: string;
  private readonly options: OpenAICompatibleOptions;

  constructor(options: OpenAICompatibleOptions) {
    super();
    this.id = options.providerId;
    this.options = options;
  }

  async streamChat(
    messages: ProviderMessage[],
    tools: ToolDefinition[],
    events: StreamEvents,
    signal?: AbortSignal,
  ): Promise<void> {
    try {
      const provider = createOpenAICompatible({
        name: this.options.providerId,
        baseURL: this.options.baseUrl,
        apiKey: this.options.apiKey,
      });

      const toolSet: ToolSet = {};
      for (const tool of tools) {
        toolSet[tool.name] = {
          description: tool.description,
          inputSchema: jsonSchema(this.toWireTool(tool).parametersJsonSchema),
        };
      }

      const result = streamText({
        model: provider.chatModel(this.options.model),
        messages: messages.map(toModelMessage),
        tools: toolSet,
        ...(signal ? { abortSignal: signal } : {}),
      });

      for await (const part of result.fullStream) {
        if (part.type === "text-delta") {
          events.onDelta(part.text);
        } else if (part.type === "tool-call") {
          events.onToolCall({
            name: part.toolName,
            arguments: (part.input ?? {}) as Record<string, unknown>,
            tabId: 0,
          });
        } else if (part.type === "error") {
          throw part.error instanceof Error ? part.error : new Error(String(part.error));
        }
      }
      events.onDone();
    } catch (error) {
      events.onError(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

function toModelMessage(message: ProviderMessage): ModelMessage {
  if (message.role === "tool") {
    return {
      role: "tool",
      content: [
        {
          type: "tool-result",
          toolCallId: message.toolCallId ?? "unknown",
          toolName: "unknown",
          output: { type: "text", value: message.content },
        },
      ],
    };
  }
  if (message.imageBase64) {
    return {
      role: "user",
      content: [
        { type: "text", text: message.content },
        { type: "image", image: message.imageBase64 },
      ],
    };
  }
  if (message.role === "assistant") return { role: "assistant", content: message.content };
  if (message.role === "system") return { role: "system", content: message.content };
  return { role: "user", content: message.content };
}
