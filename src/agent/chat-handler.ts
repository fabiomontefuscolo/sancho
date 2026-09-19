import { makeEnvelope, postToPort } from "../bridge/messages";
import { createProvider } from "../providers/factory";
import { getConversation, saveConversation } from "../storage/local";
import type { Message } from "../types";

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
  postToPort(port, makeEnvelope("event", "conversation.state", conversation));

  const assistantId = crypto.randomUUID();
  try {
    const provider = await createProvider();
    await provider.streamChat([{ role: "user", content: payload.text }], [], {
      onDelta: (text) => {
        postToPort(port, makeEnvelope("event", "chat.delta", { messageId: assistantId, text }));
      },
      onToolCall: () => {},
      onDone: () => {
        postToPort(port, makeEnvelope("event", "chat.done", { messageId: assistantId }));
      },
      onError: (error) => {
        postToPort(
          port,
          makeEnvelope("event", "chat.error", { message: error.message }, assistantId),
        );
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    postToPort(port, makeEnvelope("event", "chat.error", { message }, assistantId));
  }
}
