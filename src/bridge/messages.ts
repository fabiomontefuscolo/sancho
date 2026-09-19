import type { Action, Conversation, ProviderConfig, ToolCall } from "../types";

export interface Envelope<T extends string, P> {
  kind: "request" | "response" | "event";
  type: T;
  id: string;
  payload: P;
}

export interface ChatSendPayload {
  text: string;
  tabId: number;
}
export interface ChatDeltaPayload {
  messageId: string;
  text: string;
}
export interface ChatToolPayload {
  toolCall: ToolCall;
  status: "started" | "finished";
}
export interface ChatDonePayload {
  messageId: string;
  cancelled?: boolean;
}
export interface ChatErrorPayload {
  message: string;
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

export type UiToBackground =
  | Envelope<"chat.send", ChatSendPayload>
  | Envelope<"chat.cancel", Record<string, never>>
  | Envelope<"chat.clear", Record<string, never>>
  | Envelope<"conversation.get", Record<string, never>>
  | Envelope<"action.run", ActionRunPayload>
  | Envelope<"screenshot.consent", ScreenshotConsentPayload>
  | Envelope<"settings.get", Record<string, never>>
  | Envelope<"settings.set", SettingsSetPayload>
  | Envelope<"actions.list", Record<string, never>>
  | Envelope<"actions.upsert", ActionUpsertPayload>
  | Envelope<"actions.delete", ActionDeletePayload>;

export type BackgroundToUi =
  | Envelope<"chat.delta", ChatDeltaPayload>
  | Envelope<"chat.tool", ChatToolPayload>
  | Envelope<"chat.done", ChatDonePayload>
  | Envelope<"chat.error", ChatErrorPayload>
  | Envelope<"conversation.state", Conversation>
  | Envelope<"action.result", ActionResultPayload>
  | Envelope<"settings.state", { config: ProviderConfig | null; hasApiKey: boolean }>
  | Envelope<"actions.state", Action[]>;

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
