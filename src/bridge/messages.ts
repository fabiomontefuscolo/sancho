import type { Action, Conversation, ConversationSummary, ProviderConfig } from "../types";

export interface Envelope<T extends string, P> {
  kind: "request" | "response" | "event";
  type: T;
  id: string;
  payload: P;
}

export interface ChatSendPayload {
  text: string;
  tabId: number;
  conversationId: string;
}
export interface ChatDeltaPayload {
  messageId: string;
  text: string;
  part?: "text" | "reasoning";
  conversationId: string;
}
export interface ChatToolPayload {
  toolCallId: string;
  toolName: string;
  argsText: string;
  result?: string;
  status: "started" | "finished";
  conversationId?: string;
}
export interface ChatDonePayload {
  messageId: string;
  cancelled?: boolean;
  conversationId: string;
}
export interface ChatErrorPayload {
  message: string;
  messageId?: string;
  conversationId?: string;
}
export interface ConversationGetPayload {
  conversationId?: string;
}
export interface ConversationSelectPayload {
  conversationId: string;
}
export interface ConversationDeletePayload {
  conversationId: string;
}
export interface ConversationsStatePayload {
  conversations: ConversationSummary[];
  activeConversationId: string;
}
export interface ActionRunPayload {
  actionId: string;
  tabId: number;
  selection: string;
  editable: boolean;
}
export interface ActionResultPayload {
  actionId: string;
  replacement?: string;
  text?: string;
}
export interface ScreenshotConsentPayload {
  granted: boolean;
}
export interface SettingsSetPayload {
  config: ProviderConfig;
  apiKey?: string;
}
export interface ActionUpsertPayload {
  action: Action;
}
export interface ActionDeletePayload {
  actionId: string;
}
export interface PermissionOption {
  optionId: string;
  name: string;
  kind: string;
}
export interface PermissionRequestPayload {
  requestId: string;
  title: string;
  options: PermissionOption[];
}
export interface PermissionResponsePayload {
  requestId: string;
  optionId: string | null;
}
export type CopilotAuthStatePayload =
  | { status: "disconnected" }
  | { status: "pending"; userCode: string; verificationUri: string }
  | { status: "connected" }
  | { status: "error"; message: string };
export interface CopilotModelsPayload {
  models: string[];
  error?: string;
}

export type UiToBackground =
  | Envelope<"chat.send", ChatSendPayload>
  | Envelope<"chat.cancel", Record<string, never>>
  | Envelope<"chat.regenerate", Record<string, never>>
  | Envelope<"chat.clear", Record<string, never>>
  | Envelope<"conversation.get", ConversationGetPayload>
  | Envelope<"conversations.list", Record<string, never>>
  | Envelope<"conversations.select", ConversationSelectPayload>
  | Envelope<"conversations.new", Record<string, never>>
  | Envelope<"conversations.delete", ConversationDeletePayload>
  | Envelope<"action.run", ActionRunPayload>
  | Envelope<"screenshot.consent", ScreenshotConsentPayload>
  | Envelope<"settings.get", Record<string, never>>
  | Envelope<"settings.set", SettingsSetPayload>
  | Envelope<"permission.response", PermissionResponsePayload>
  | Envelope<"actions.list", Record<string, never>>
  | Envelope<"actions.upsert", ActionUpsertPayload>
  | Envelope<"actions.delete", ActionDeletePayload>
  | Envelope<"copilot.auth.start", Record<string, never>>
  | Envelope<"copilot.auth.status", Record<string, never>>
  | Envelope<"copilot.auth.disconnect", Record<string, never>>
  | Envelope<"copilot.models.list", Record<string, never>>;

export interface ChatStatePayload {
  conversationId: string;
  state: "planning" | "acting" | "verifying" | "done" | "stopped" | "error";
}

export type BackgroundToUi =
  | Envelope<"chat.delta", ChatDeltaPayload>
  | Envelope<"chat.tool", ChatToolPayload>
  | Envelope<"chat.done", ChatDonePayload>
  | Envelope<"chat.error", ChatErrorPayload>
  | Envelope<"chat.state", ChatStatePayload>
  | Envelope<"conversation.state", Conversation>
  | Envelope<"conversations.state", ConversationsStatePayload>
  | Envelope<"action.result", ActionResultPayload>
  | Envelope<"settings.state", { config: ProviderConfig | null; hasApiKey: boolean }>
  | Envelope<"actions.state", Action[]>
  | Envelope<"permission.request", PermissionRequestPayload>
  | Envelope<"copilot.auth.state", CopilotAuthStatePayload>
  | Envelope<"copilot.models.state", CopilotModelsPayload>;

export type AnyEnvelope = UiToBackground | BackgroundToUi;

export const UI_PORT_NAME = "sancho-ui";

export function isEnvelope(value: unknown): value is AnyEnvelope {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    (candidate.kind === "request" || candidate.kind === "response" || candidate.kind === "event") &&
    typeof candidate.type === "string" &&
    typeof candidate.id === "string" &&
    "payload" in candidate
  );
}

export function makeEnvelope<T extends string, P>(
  kind: Envelope<T, P>["kind"],
  type: T,
  payload: P,
  id?: string,
): Envelope<T, P> {
  return { kind, type, id: id ?? crypto.randomUUID(), payload };
}

export function postToPort(port: chrome.runtime.Port, envelope: AnyEnvelope): void {
  port.postMessage(envelope);
}

export function onPortEnvelope(
  port: chrome.runtime.Port,
  handler: (envelope: AnyEnvelope) => void,
): void {
  port.onMessage.addListener((message: unknown) => {
    if (!isEnvelope(message)) {
      console.warn("dropping malformed envelope", message);
      return;
    }
    handler(message);
  });
}
