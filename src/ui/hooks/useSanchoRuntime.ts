import { useEffect, useMemo, useRef, useState } from "react";
import { useExternalStoreRuntime, type ThreadMessageLike } from "@assistant-ui/react";
import { UI_PORT_NAME, isEnvelope, makeEnvelope, type AnyEnvelope } from "../../bridge/messages";
import type { Conversation, Message } from "../../types";

type ThreadContentPart = Exclude<ThreadMessageLike["content"], string>[number];

function toThreadMessage(message: Message): ThreadMessageLike {
  const content: ThreadContentPart[] = [];
  for (const part of message.parts) {
    if (part.type === "text") content.push({ type: "text", text: part.text });
    if (part.type === "image") {
      content.push({ type: "image", image: `data:${part.mimeType};base64,${part.imageBase64}` });
    }
  }
  return {
    id: message.id,
    role: message.role === "tool" || message.role === "system" ? "assistant" : message.role,
    content: content.length > 0 ? content : [{ type: "text", text: "" }],
    createdAt: new Date(message.createdAt),
  };
}

export interface SanchoRuntime {
  runtime: ReturnType<typeof useExternalStoreRuntime>;
  consentRequired: boolean;
  grantConsent: () => void;
  toolActivity: string[];
}

export function useSanchoRuntime(tabId: number): SanchoRuntime {
  const [messages, setMessages] = useState<ThreadMessageLike[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [consentRequired, setConsentRequired] = useState(false);
  const [toolActivity, setToolActivity] = useState<string[]>([]);
  const portRef = useRef<chrome.runtime.Port | null>(null);
  const streamingRef = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    const port = chrome.runtime.connect({ name: UI_PORT_NAME });
    portRef.current = port;

    const appendDelta = (messageId: string, text: string) => {
      const current = streamingRef.current.get(messageId) ?? "";
      const next = current + text;
      streamingRef.current.set(messageId, next);
      setMessages((prev) => {
        const existing = prev.findIndex((message) => message.id === messageId);
        const threadMessage: ThreadMessageLike = {
          id: messageId,
          role: "assistant",
          content: [{ type: "text", text: next }],
          createdAt: new Date(),
        };
        if (existing >= 0) {
          const copy = [...prev];
          copy[existing] = threadMessage;
          return copy;
        }
        return [...prev, threadMessage];
      });
    };

    const listener = (raw: unknown) => {
      if (!isEnvelope(raw)) return;
      const envelope = raw as AnyEnvelope;
      if (envelope.type === "chat.delta") {
        appendDelta(envelope.payload.messageId, envelope.payload.text);
      } else if (envelope.type === "chat.done") {
        setIsRunning(false);
      } else if (envelope.type === "chat.error") {
        setIsRunning(false);
        if (envelope.payload.message === "consent_required") {
          setConsentRequired(true);
        } else {
          appendDelta(envelope.id, `Error: ${envelope.payload.message}`);
        }
      } else if (envelope.type === "chat.tool") {
        const label = `${envelope.payload.toolCall.name} (${envelope.payload.status})`;
        setToolActivity((prev) => [...prev.slice(-9), label]);
      } else if (envelope.type === "conversation.state") {
        const conversation = envelope.payload as Conversation;
        streamingRef.current.clear();
        setMessages(conversation.messages.map(toThreadMessage));
      } else if (envelope.type === "action.result") {
        if (envelope.payload.text) {
          appendDelta(envelope.id, envelope.payload.text);
        }
      }
    };

    port.onMessage.addListener(listener);
    port.postMessage(makeEnvelope("request", "conversation.get", {}));
    return () => port.disconnect();
  }, []);

  const runtime = useExternalStoreRuntime({
    messages,
    isRunning,
    convertMessage: (message) => message,
    onNew: async (message) => {
      const text = message.content
        .filter((part): part is { type: "text"; text: string } => part.type === "text")
        .map((part) => part.text)
        .join("");
      if (!text) return;
      setIsRunning(true);
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "user",
          content: [{ type: "text", text }],
          createdAt: new Date(),
        },
      ]);
      portRef.current?.postMessage(makeEnvelope("request", "chat.send", { text, tabId }));
    },
  });

  return useMemo(
    () => ({
      runtime,
      consentRequired,
      grantConsent: () => {
        setConsentRequired(false);
        portRef.current?.postMessage(
          makeEnvelope("request", "screenshot.consent", { granted: true }),
        );
      },
      toolActivity,
    }),
    [runtime, consentRequired, toolActivity],
  );
}
