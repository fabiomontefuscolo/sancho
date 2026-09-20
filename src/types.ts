export type ConnectionMethod = "api" | "acp";

export interface AcpConfig {
  hostName: string;
  token?: string;
}

export interface ProviderConfig {
  method: ConnectionMethod;
  providerId: string;
  baseUrl: string;
  model: string;
  apiKeyRef: string;
  acp?: AcpConfig;
}

export interface ApiKey {
  key: string;
}

export type FontSize = "small" | "medium" | "large";

export interface UiPrefs {
  fontSize: FontSize;
}

export interface Action {
  id: string;
  name: string;
  prompt: string;
  builtin: boolean;
  enabled: boolean;
}

export type MessageRole = "user" | "assistant" | "tool" | "system";

export interface TextPart {
  type: "text";
  text: string;
}

export interface ImagePart {
  type: "image";
  imageBase64: string;
  mimeType: "image/png";
}

export interface ToolCallPart {
  type: "tool-call";
  toolCall: ToolCall;
  status: "started" | "finished";
}

export type MessagePart = TextPart | ImagePart | ToolCallPart;

export interface Message {
  id: string;
  role: MessageRole;
  parts: MessagePart[];
  tabId: number | null;
  createdAt: number;
}

export interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  screenshotConsent: boolean;
  acpSessionId: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface ConversationSummary {
  id: string;
  title: string;
  updatedAt: number;
  createdAt: number;
  messageCount: number;
}

export type AgentSessionState =
  "idle" | "planning" | "acting" | "verifying" | "done" | "stopped" | "error";

export interface AgentSession {
  conversationId: string;
  state: AgentSessionState;
  iteration: number;
  maxIterations: number;
  pendingToolCall: ToolCall | null;
}

export interface ToolCall {
  name: string;
  arguments: Record<string, unknown>;
  tabId: number;
}

export const DEFAULT_MAX_ITERATIONS = 25;
