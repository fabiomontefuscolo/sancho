import { makeEnvelope, postToPort } from "../bridge/messages";
import type {
  ChatSendPayload,
  ConversationDeletePayload,
  ConversationGetPayload,
  ConversationSelectPayload,
} from "../bridge/messages";
import { createProvider } from "../providers/factory";
import { AcpProvider } from "../providers/acp";
import type { ProviderMessage } from "../providers/base";
import {
  clearAgentSession,
  getAgentSession,
  newAgentSession,
  saveAgentSession,
} from "../storage/local";
import {
  createConversation,
  deleteConversation,
  getActiveConversation,
  getActiveConversationId,
  getConversation,
  listConversations,
  saveConversationRecord,
  setActiveConversation,
} from "../storage/conversations";
import type { Conversation, Message, ToolCall } from "../types";
import { runAgentLoop } from "./loop";
import { startKeepAlive } from "./keepalive";
import { logEvent } from "./log";
import { RestrictedPageError } from "./inject";
import { executeTool } from "./tools";
import { formatTimestamp, systemClockMessage } from "./time";

const runAborts = new Map<string, AbortController>();

export const RUN_WATCHDOG_MS = 60_000;
export const WATCHDOG_MESSAGE = "agent not responding — check the local agent connection";

function abortRun(conversationId: string | null): boolean {
  if (!conversationId) return false;
  const controller = runAborts.get(conversationId);
  if (!controller) return false;
  controller.abort();
  runAborts.delete(conversationId);
  return true;
}

const pendingPermissions = new Map<string, (optionId: string | null) => void>();

export function handlePermissionResponse(payload: {
  requestId: string;
  optionId: string | null;
}): void {
  const resolve = pendingPermissions.get(payload.requestId);
  if (!resolve) return;
  pendingPermissions.delete(payload.requestId);
  resolve(payload.optionId);
}

export function requestPermissionFromUser(
  port: chrome.runtime.Port,
  request: { title: string; options: Array<{ optionId: string; name: string; kind: string }> },
  timeoutMs = 120_000,
): Promise<string | null> {
  return new Promise((resolve) => {
    const requestId = crypto.randomUUID();
    const timer = setTimeout(() => {
      pendingPermissions.delete(requestId);
      resolve(null);
    }, timeoutMs);
    pendingPermissions.set(requestId, (optionId) => {
      clearTimeout(timer);
      resolve(optionId);
    });
    postToPort(port, makeEnvelope("event", "permission.request", { requestId, ...request }));
  });
}

function postConversation(port: chrome.runtime.Port, conversation: Conversation): void {
  postToPort(port, makeEnvelope("event", "conversation.state", conversation));
}

async function postConversationIfActive(
  port: chrome.runtime.Port,
  conversation: Conversation,
): Promise<void> {
  if ((await getActiveConversationId()) === conversation.id) {
    postConversation(port, conversation);
  }
}

async function postConversationsState(port: chrome.runtime.Port): Promise<void> {
  const conversations = await listConversations();
  const activeConversationId = (await getActiveConversationId()) ?? conversations[0]?.id ?? "";
  postToPort(
    port,
    makeEnvelope("event", "conversations.state", { conversations, activeConversationId }),
  );
}

function toProviderMessages(conversation: Conversation): ProviderMessage[] {
  return conversation.messages.map((message) => {
    const text = message.parts
      .filter((part) => part.type === "text")
      .map((part) => (part.type === "text" ? part.text : ""))
      .join("\n");
    const image = message.parts.find((part) => part.type === "image");
    const result: ProviderMessage = {
      role:
        message.role === "system" ? "system" : message.role === "assistant" ? "assistant" : "user",
      content: `${formatTimestamp(message.createdAt)} ${text}`,
    };
    if (image && image.type === "image") result.imageBase64 = image.imageBase64;
    return result;
  });
}

async function buildProviderMessages(
  conversation: Conversation,
  tabId: number,
): Promise<ProviderMessage[]> {
  let title: string | undefined;
  let url: string | undefined;
  try {
    const tab = await chrome.tabs.get(tabId);
    title = tab.title ?? undefined;
    url = tab.url ?? undefined;
  } catch {
    // restricted or missing tab: clock still works without tab context
  }
  return [systemClockMessage(title, url), ...toProviderMessages(conversation)];
}

export async function handleChatSend(
  payload: ChatSendPayload,
  port: chrome.runtime.Port,
): Promise<void> {
  const loaded = await getConversation(payload.conversationId);
  const conversation = loaded ?? (await getActiveConversation());
  const userMessage: Message = {
    id: crypto.randomUUID(),
    role: "user",
    parts: [{ type: "text", text: payload.text }],
    tabId: payload.tabId,
    createdAt: Date.now(),
  };
  conversation.messages.push(userMessage);
  const savedUser = await saveConversationRecord(conversation);
  conversation.title = savedUser.title;
  await postConversationIfActive(port, conversation);
  void postConversationsState(port);

  await runConversation(conversation, payload.tabId, port);
}

export async function handleChatRegenerate(port: chrome.runtime.Port): Promise<void> {
  const conversation = await getActiveConversation();
  const lastUserIndex = conversation.messages.map((m) => m.role).lastIndexOf("user");
  if (lastUserIndex < 0) return;
  abortRun(conversation.id);
  conversation.messages = conversation.messages.slice(0, lastUserIndex + 1);
  await saveConversationRecord(conversation);
  await postConversationIfActive(port, conversation);
  void postConversationsState(port);
  await runConversation(conversation, conversation.messages[lastUserIndex]?.tabId ?? 0, port);
}

async function runConversation(
  conversation: Conversation,
  tabId: number,
  port: chrome.runtime.Port,
): Promise<void> {
  const conversationId = conversation.id;
  const assistantId = crypto.randomUUID();
  let provider;
  try {
    provider = await createProvider();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    postToPort(
      port,
      makeEnvelope("event", "chat.error", { message, messageId: assistantId, conversationId }),
    );
    return;
  }

  const storedSession = await getAgentSession();
  const session =
    storedSession && storedSession.conversationId === conversationId
      ? storedSession
      : newAgentSession(conversationId);
  const abort = new AbortController();
  runAborts.set(conversationId, abort);
  const stopKeepAlive = startKeepAlive();
  logEvent("run start", { conversationId, provider: provider.id });
  let watchdog: ReturnType<typeof setTimeout> | null = null;
  const armWatchdog = () => {
    if (watchdog) clearTimeout(watchdog);
    watchdog = setTimeout(() => {
      logEvent("run watchdog fired", { conversationId });
      postToPort(
        port,
        makeEnvelope("event", "chat.error", {
          message: WATCHDOG_MESSAGE,
          messageId: assistantId,
          conversationId,
        }),
      );
      abortRun(conversationId);
    }, RUN_WATCHDOG_MS);
  };
  armWatchdog();
  let assistantText = "";

  if (provider instanceof AcpProvider) {
    provider.useConversation(conversationId, conversation.acpSessionId);
    provider.setSessionCreatedHandler((sessionId) => {
      conversation.acpSessionId = sessionId;
      void saveConversationRecord(conversation);
    });
    provider.setSessionInvalidHandler(() => {
      conversation.acpSessionId = null;
      void saveConversationRecord(conversation);
    });
    provider.setDisconnectHandler(() => {
      postToPort(
        port,
        makeEnvelope("event", "chat.error", {
          message: "local agent stopped — it will restart on your next message",
          messageId: assistantId,
          conversationId,
        }),
      );
    });
    provider.setPermissionHandler((request) => requestPermissionFromUser(port, request));
    provider.setToolInvokeHandler(async (request) => {
      armWatchdog();
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const toolTabId = tab?.id ?? tabId;
      const toolCall: ToolCall = {
        name: request.name,
        arguments: request.arguments,
        tabId: toolTabId,
      };
      const toolCallId = toolCall.id ?? crypto.randomUUID();
      postToPort(
        port,
        makeEnvelope("event", "chat.tool", {
          toolCallId,
          toolName: request.name,
          argsText: JSON.stringify(request.arguments),
          status: "started" as const,
          conversationId,
        }),
      );
      try {
        const result = await executeTool(request.name, request.arguments, toolTabId);
        postToPort(
          port,
          makeEnvelope("event", "chat.tool", {
            toolCallId,
            toolName: request.name,
            argsText: JSON.stringify(request.arguments),
            result: JSON.stringify(result),
            status: "finished" as const,
            conversationId,
          }),
        );
        if (
          typeof result === "object" &&
          result !== null &&
          (result as Record<string, unknown>).error === "consent_required"
        ) {
          postToPort(
            port,
            makeEnvelope("event", "chat.error", { message: "consent_required", conversationId }),
          );
        }
        await maybeAppendScreenshot(port, conversation, toolCall, result);
        return result;
      } catch (error) {
        if (error instanceof RestrictedPageError) {
          return { ok: false, error: "page interaction unavailable on this page (restricted)" };
        }
        throw error;
      }
    });
  }

  let finalSession;
  try {
    finalSession = await runAgentLoop(
      {
        provider,
        getMessages: async () => buildProviderMessages(conversation, tabId),
        signal: abort.signal,
        onDelta: (text) => {
          armWatchdog();
          assistantText += text;
          postToPort(
            port,
            makeEnvelope("event", "chat.delta", { messageId: assistantId, text, conversationId }),
          );
        },
        onReasoningDelta: (text) => {
          armWatchdog();
          postToPort(
            port,
            makeEnvelope("event", "chat.delta", {
              messageId: assistantId,
              text,
              part: "reasoning" as const,
              conversationId,
            }),
          );
        },
        onStateChange: (state) => {
          if (state !== "idle") {
            postToPort(port, makeEnvelope("event", "chat.state", { state, conversationId }));
          }
        },
        saveSession: saveAgentSession,
        executeTool: async (call: ToolCall) => {
          armWatchdog();
          const toolCall: ToolCall = { ...call, tabId: call.tabId || tabId };
          const toolCallId = toolCall.id ?? crypto.randomUUID();
          const argsText = JSON.stringify(toolCall.arguments);
          postToPort(
            port,
            makeEnvelope("event", "chat.tool", {
              toolCallId,
              toolName: toolCall.name,
              argsText,
              status: "started" as const,
              conversationId,
            }),
          );
          try {
            const result = await executeTool(toolCall.name, toolCall.arguments, toolCall.tabId);
            postToPort(
              port,
              makeEnvelope("event", "chat.tool", {
                toolCallId,
                toolName: toolCall.name,
                argsText,
                result: JSON.stringify(result),
                status: "finished" as const,
                conversationId,
              }),
            );
            if (
              typeof result === "object" &&
              result !== null &&
              (result as Record<string, unknown>).error === "consent_required"
            ) {
              postToPort(
                port,
                makeEnvelope("event", "chat.error", {
                  message: "consent_required",
                  conversationId,
                }),
              );
            }
            await maybeAppendScreenshot(port, conversation, toolCall, result);
            return result;
          } catch (error) {
            if (error instanceof RestrictedPageError) {
              return {
                ok: false,
                error: "page interaction unavailable on this page (restricted)",
              };
            }
            throw error;
          }
        },
      },
      session,
    );
  } finally {
    if (watchdog) clearTimeout(watchdog);
    stopKeepAlive();
    logEvent("run end", { conversationId, provider: provider.id });
  }

  if (assistantText) {
    conversation.messages.push({
      id: assistantId,
      role: "assistant",
      parts: [{ type: "text", text: assistantText }],
      tabId,
      createdAt: Date.now(),
    });
    await saveConversationRecord(conversation);
    void postConversationsState(port);
  }
  if (finalSession.state === "error") {
    postToPort(
      port,
      makeEnvelope("event", "chat.error", {
        message: finalSession.lastError ?? "the run failed",
        messageId: assistantId,
        conversationId,
      }),
    );
  }
  if (finalSession.state === "done" || finalSession.state === "stopped") {
    await clearAgentSession();
  }
  logEvent("run finished", { conversationId, state: finalSession.state });
  runAborts.delete(conversationId);
  postToPort(
    port,
    makeEnvelope("event", "chat.done", {
      messageId: assistantId,
      conversationId,
      ...(finalSession.state === "stopped" ? { cancelled: true } : {}),
    }),
  );
  await postConversationIfActive(port, conversation);
}

async function maybeAppendScreenshot(
  port: chrome.runtime.Port,
  conversation: Conversation,
  call: ToolCall,
  result: unknown,
): Promise<void> {
  if (call.name !== "captureScreenshot") return;
  if (typeof result !== "object" || result === null) return;
  const record = result as Record<string, unknown>;
  if (typeof record.imageBase64 !== "string") return;
  conversation.messages.push({
    id: crypto.randomUUID(),
    role: "user",
    parts: [
      { type: "text", text: "[screenshot of the visible page]" },
      { type: "image", imageBase64: record.imageBase64, mimeType: "image/png" },
    ],
    tabId: call.tabId,
    createdAt: Date.now(),
  });
  await saveConversationRecord(conversation);
  await postConversationIfActive(port, conversation);
  void postConversationsState(port);
}

export async function handleChatCancel(port: chrome.runtime.Port): Promise<void> {
  const conversationId = (await getActiveConversationId()) ?? "";
  abortRun(conversationId);
  await clearAgentSession();
  postToPort(
    port,
    makeEnvelope("event", "chat.done", {
      messageId: crypto.randomUUID(),
      cancelled: true,
      conversationId,
    }),
  );
}

export async function handleChatClear(port: chrome.runtime.Port): Promise<void> {
  const activeId = await getActiveConversationId();
  abortRun(activeId);
  await clearAgentSession();
  if (activeId) await deleteConversation(activeId);
  const fresh = await createConversation();
  postConversation(port, fresh);
  await postConversationsState(port);
}

export async function handleConversationGet(
  payload: ConversationGetPayload,
  port: chrome.runtime.Port,
): Promise<void> {
  const conversation = payload.conversationId
    ? ((await getConversation(payload.conversationId)) ?? (await getActiveConversation()))
    : await getActiveConversation();
  postConversation(port, conversation);
}

export async function handleConversationsList(port: chrome.runtime.Port): Promise<void> {
  await postConversationsState(port);
}

export async function handleConversationsSelect(
  payload: ConversationSelectPayload,
  port: chrome.runtime.Port,
): Promise<void> {
  const ok = await setActiveConversation(payload.conversationId);
  if (!ok) {
    postToPort(
      port,
      makeEnvelope("event", "chat.error", {
        message: "unknown conversation",
        conversationId: payload.conversationId,
      }),
    );
    return;
  }
  const conversation = await getConversation(payload.conversationId);
  if (conversation) postConversation(port, conversation);
  await postConversationsState(port);
}

export async function handleConversationsNew(port: chrome.runtime.Port): Promise<void> {
  const conversation = await createConversation();
  postConversation(port, conversation);
  await postConversationsState(port);
}

export async function handleConversationsDelete(
  payload: ConversationDeletePayload,
  port: chrome.runtime.Port,
): Promise<void> {
  const wasActive = (await getActiveConversationId()) === payload.conversationId;
  if (abortRun(payload.conversationId) || wasActive) {
    await clearAgentSession();
  }
  await deleteConversation(payload.conversationId);
  if (wasActive) {
    const fresh = await createConversation();
    postConversation(port, fresh);
  }
  await postConversationsState(port);
}

export async function handleScreenshotConsent(
  payload: { granted: boolean },
  port: chrome.runtime.Port,
): Promise<void> {
  const conversation = await getActiveConversation();
  conversation.screenshotConsent = payload.granted;
  await saveConversationRecord(conversation);
  postConversation(port, conversation);
}
