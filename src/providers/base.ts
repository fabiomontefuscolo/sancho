import { z } from "zod";
import type { ToolCall } from "../types";

export interface ProviderMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  toolCallId?: string;
  toolName?: string;
  toolCalls?: ToolCall[];
  imageBase64?: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: z.ZodType;
}

export interface WireTool {
  name: string;
  description: string;
  parametersJsonSchema: Record<string, unknown>;
}

export interface StreamEvents {
  onDelta: (text: string) => void;
  onReasoningDelta?: (text: string) => void;
  onToolCall: (toolCall: ToolCall) => void;
  onDone: () => void;
  onError: (error: Error) => void;
}

export abstract class BaseLLMProvider {
  abstract readonly id: string;

  abstract streamChat(
    messages: ProviderMessage[],
    tools: ToolDefinition[],
    events: StreamEvents,
    signal?: AbortSignal,
  ): Promise<void>;

  toWireTool(tool: ToolDefinition): WireTool {
    return {
      name: tool.name,
      description: tool.description,
      parametersJsonSchema: z.toJSONSchema(tool.parameters) as Record<string, unknown>,
    };
  }
}
