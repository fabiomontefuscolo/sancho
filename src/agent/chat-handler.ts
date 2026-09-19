import { makeEnvelope, postToPort } from "../bridge/messages";
import { createProvider } from "../providers/factory";
import { AcpProvider } from "../providers/acp";
import type { ProviderMessage } from "../providers/base";
import {
  clearAgentSession,
  clearConversation,
  getAgentSession,
  getConversation,
  newAgentSession,
  saveAgentSession,
  saveConversation,
} from "../storage/local";
import type { Conversation, Message, ToolCall } from "../types";
import { runAgentLoop } from "./loop";
import { RestrictedPageError } from "./inject";
import { executeTool } from "./tools";
import { formatTimestamp, systemClockMessage } from "./time";

let activeAbort: AbortController | null = null;

function postConversation(port: chrome.runtime.Port, conversation: Conversation): void {
  postToPort(port, makeEnvelope("event", "conversation.state", conversation));
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
  payload: { text: string; tabId: number },
  port: chrome.runtime.Port,
): Promise<void> {
  const conversation = await getConversation();
  const userMessage: Message = {
    id: crypto.randomUUID(),
    role: "user",
    parts: [{ type: "text", text: payload.text }],
    tabId: payload.tabId,
    createdAt: Date.now(),
  };
  conversation.messages.push(userMessage);
  await saveConversation(conversation);
  postConversation(port, conversation);

  const assistantId = crypto.randomUUID();
  let provider;
  try {
    provider = await createProvider();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    postToPort(port, makeEnvelope("event", "chat.error", { message }, assistantId));
    return;
  }

  const session = (await getAgentSession()) ?? newAgentSession(conversation.id);
  activeAbort = new AbortController();
  let assistantText = "";

  if (provider instanceof AcpProvider) {
    provider.setToolInvokeHandler(async (request) => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const tabId = tab?.id ?? payload.tabId;
      const toolCall: ToolCall = { name: request.name, arguments: request.arguments, tabId };
      postToPort(
        port,
        makeEnvelope("event", "chat.tool", { toolCall, status: "started" as const }),
      );
      try {
        const result = await executeTool(request.name, request.arguments, tabId);
        postToPort(
          port,
          makeEnvelope("event", "chat.tool", { toolCall, status: "finished" as const }),
        );
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

  const finalSession = await runAgentLoop(
    {
      provider,
      getMessages: async () => buildProviderMessages(conversation, payload.tabId),
      signal: activeAbort.signal,
      onDelta: (text) => {
        assistantText += text;
        postToPort(port, makeEnvelope("event", "chat.delta", { messageId: assistantId, text }));
      },
      onStateChange: () => {},
      saveSession: saveAgentSession,
      executeTool: async (call: ToolCall) => {
        const toolCall: ToolCall = { ...call, tabId: call.tabId || payload.tabId };
        postToPort(
          port,
          makeEnvelope("event", "chat.tool", { toolCall, status: "started" as const }),
        );
        try {
          const result = await executeTool(toolCall.name, toolCall.arguments, toolCall.tabId);
          postToPort(
            port,
            makeEnvelope("event", "chat.tool", { toolCall, status: "finished" as const }),
          );
          if (
            typeof result === "object" &&
            result !== null &&
            (result as Record<string, unknown>).error === "consent_required"
          ) {
            postToPort(port, makeEnvelope("event", "chat.error", { message: "consent_required" }));
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

  if (assistantText) {
    conversation.messages.push({
      id: assistantId,
      role: "assistant",
      parts: [{ type: "text", text: assistantText }],
      tabId: payload.tabId,
      createdAt: Date.now(),
    });
    await saveConversation(conversation);
  }
  if (finalSession.state === "done" || finalSession.state === "stopped") {
    await clearAgentSession();
  }
  activeAbort = null;
  postToPort(
    port,
    makeEnvelope("event", "chat.done", {
      messageId: assistantId,
      ...(finalSession.state === "stopped" ? { cancelled: true } : {}),
    }),
  );
  postConversation(port, conversation);
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
  await saveConversation(conversation);
  postConversation(port, conversation);
}

export async function handleChatCancel(port: chrome.runtime.Port): Promise<void> {
  activeAbort?.abort();
  activeAbort = null;
  await clearAgentSession();
  postToPort(
    port,
    makeEnvelope("event", "chat.done", { messageId: crypto.randomUUID(), cancelled: true }),
  );
}

export async function handleChatClear(port: chrome.runtime.Port): Promise<void> {
  activeAbort?.abort();
  activeAbort = null;
  await clearAgentSession();
  const fresh = await clearConversation();
  postConversation(port, fresh);
}

export async function handleConversationGet(port: chrome.runtime.Port): Promise<void> {
  postConversation(port, await getConversation());
}

export async function handleScreenshotConsent(
  payload: { granted: boolean },
  port: chrome.runtime.Port,
): Promise<void> {
  const conversation = await getConversation();
  conversation.screenshotConsent = payload.granted;
  await saveConversation(conversation);
  postConversation(port, conversation);
}
