import { useEffect, useMemo, useRef, useState } from "react";
import { useExternalStoreRuntime, type ThreadMessageLike } from "@assistant-ui/react";
import { UI_PORT_NAME, isEnvelope, makeEnvelope, type AnyEnvelope } from "../../bridge/messages";
import { toThreadListAdapter } from "../threadlist-adapter";
import type { Conversation, ConversationSummary, Message } from "../../types";

type ThreadContentPart = Exclude<ThreadMessageLike["content"], string>[number];

interface LiveToolEntry {
  toolName: string;
  argsText: string;
  result?: string;
  status: "started" | "finished";
}

interface LiveAssistant {
  text: string;
  reasoning: string;
  tools: Map<string, LiveToolEntry>;
}

function buildLiveContent(live: LiveAssistant): ThreadContentPart[] {
  const parts: ThreadContentPart[] = [];
  if (live.reasoning) parts.push({ type: "reasoning", text: live.reasoning });
  for (const [toolCallId, tool] of live.tools) {
    parts.push({
      type: "tool-call",
      toolCallId,
      toolName: tool.toolName,
      argsText: tool.argsText,
      args: {},
      ...(tool.result !== undefined ? { result: tool.result } : {}),
    });
  }
  parts.push({ type: "text", text: live.text });
  return parts;
}

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

export interface PendingPermission {
  requestId: string;
  title: string;
  options: Array<{ optionId: string; name: string; kind: string }>;
}

export interface SanchoRuntime {
  runtime: ReturnType<typeof useExternalStoreRuntime>;
  consentRequired: boolean;
  grantConsent: () => void;
  diagnosticsConsentRequired: boolean;
  grantDiagnosticsConsent: () => void;
  agentState: string | null;
  isRunning: boolean;
  pendingPermission: PendingPermission | null;
  resolvePermission: (optionId: string | null) => void;
  conversations: ConversationSummary[];
  activeConversationId: string;
  requestConversations: () => void;
  selectConversation: (conversationId: string) => void;
  newConversation: () => void;
  deleteConversation: (conversationId: string) => void;
}

export function useSanchoRuntime(tabId: number): SanchoRuntime {
  const [messages, setMessages] = useState<ThreadMessageLike[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [consentRequired, setConsentRequired] = useState(false);
  const [diagnosticsConsentRequired, setDiagnosticsConsentRequired] = useState(false);
  const [agentState, setAgentState] = useState<string | null>(null);
  const [pendingPermission, setPendingPermission] = useState<PendingPermission | null>(null);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeConversationId, setActiveConversationId] = useState("");
  const portRef = useRef<chrome.runtime.Port | null>(null);
  const liveRef = useRef<Map<string, LiveAssistant>>(new Map());
  const lastAssistantIdRef = useRef<string | null>(null);
  const currentConversationIdRef = useRef<string | null>(null);
  const tabIdRef = useRef(tabId);
  tabIdRef.current = tabId;
  const activeConversationRef = useRef("");
  activeConversationRef.current = activeConversationId;

  useEffect(() => {
    const port = chrome.runtime.connect({ name: UI_PORT_NAME });
    portRef.current = port;

    const getLive = (messageId: string): LiveAssistant => {
      let live = liveRef.current.get(messageId);
      if (!live) {
        live = { text: "", reasoning: "", tools: new Map() };
        liveRef.current.set(messageId, live);
      }
      return live;
    };

    const renderLive = (messageId: string) => {
      const live = liveRef.current.get(messageId);
      if (!live) return;
      const content = buildLiveContent(live);
      setMessages((prev) => {
        const existing = prev.findIndex((message) => message.id === messageId);
        const threadMessage: ThreadMessageLike = {
          id: messageId,
          role: "assistant",
          content,
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

    const appendDelta = (messageId: string, text: string, part: "text" | "reasoning" = "text") => {
      const live = getLive(messageId);
      if (part === "reasoning") {
        live.reasoning += text;
      } else {
        live.text += text;
      }
      renderLive(messageId);
    };

    const upsertTool = (
      messageId: string,
      payload: {
        toolCallId: string;
        toolName: string;
        argsText: string;
        result?: string;
        status: "started" | "finished";
      },
    ) => {
      const live = getLive(messageId);
      live.tools.set(payload.toolCallId, {
        toolName: payload.toolName,
        argsText: payload.argsText,
        ...(payload.result !== undefined ? { result: payload.result } : {}),
        status: payload.status,
      });
      renderLive(messageId);
    };

    const settleTools = (messageId: string) => {
      const live = liveRef.current.get(messageId);
      if (!live) return;
      let changed = false;
      for (const tool of live.tools.values()) {
        if (tool.status === "started") {
          tool.status = "finished";
          if (tool.result === undefined) tool.result = "[interrupted]";
          changed = true;
        }
      }
      if (changed) renderLive(messageId);
    };

    const isForActiveConversation = (conversationId: string | undefined) =>
      conversationId === undefined ||
      activeConversationRef.current === "" ||
      conversationId === activeConversationRef.current;

    const listener = (raw: unknown) => {
      if (!isEnvelope(raw)) return;
      const envelope = raw as AnyEnvelope;
      if (envelope.type === "chat.delta") {
        if (!isForActiveConversation(envelope.payload.conversationId)) return;
        lastAssistantIdRef.current = envelope.payload.messageId;
        appendDelta(envelope.payload.messageId, envelope.payload.text, envelope.payload.part);
      } else if (envelope.type === "chat.done") {
        if (!isForActiveConversation(envelope.payload.conversationId)) return;
        settleTools(envelope.payload.messageId);
        if (
          lastAssistantIdRef.current &&
          lastAssistantIdRef.current !== envelope.payload.messageId
        ) {
          settleTools(lastAssistantIdRef.current);
        }
        setIsRunning(false);
        setAgentState(null);
      } else if (envelope.type === "chat.error") {
        if (!isForActiveConversation(envelope.payload.conversationId)) return;
        setIsRunning(false);
        setAgentState(null);
        if (envelope.payload.message === "consent_required") {
          setConsentRequired(true);
        } else if (envelope.payload.message === "diagnostics_consent_required") {
          setDiagnosticsConsentRequired(true);
        } else {
          const messageId = envelope.payload.messageId ?? lastAssistantIdRef.current ?? envelope.id;
          settleTools(messageId);
          const live = getLive(messageId);
          const content = buildLiveContent(live);
          const threadMessage: ThreadMessageLike = {
            id: messageId,
            role: "assistant",
            content,
            createdAt: new Date(),
            status: { type: "incomplete", reason: "error", error: envelope.payload.message },
          };
          setMessages((prev) => {
            const existing = prev.findIndex((message) => message.id === messageId);
            if (existing >= 0) {
              const copy = [...prev];
              copy[existing] = threadMessage;
              return copy;
            }
            return [...prev, threadMessage];
          });
        }
      } else if (envelope.type === "chat.state") {
        if (!isForActiveConversation(envelope.payload.conversationId)) return;
        const state = envelope.payload.state;
        setAgentState(state === "done" || state === "stopped" || state === "error" ? null : state);
      } else if (envelope.type === "chat.tool") {
        if (!isForActiveConversation(envelope.payload.conversationId)) return;
        const messageId = envelope.payload.messageId ?? lastAssistantIdRef.current ?? envelope.id;
        lastAssistantIdRef.current = messageId;
        upsertTool(messageId, envelope.payload);
      } else if (envelope.type === "permission.request") {
        setPendingPermission({
          requestId: envelope.payload.requestId,
          title: envelope.payload.title,
          options: envelope.payload.options,
        });
      } else if (envelope.type === "conversation.state") {
        const conversation = envelope.payload as Conversation;
        const sameConversation = currentConversationIdRef.current === conversation.id;
        currentConversationIdRef.current = conversation.id;
        setActiveConversationId(conversation.id);
        if (!sameConversation) {
          liveRef.current.clear();
          lastAssistantIdRef.current = null;
          setMessages(conversation.messages.map(toThreadMessage));
          return;
        }
        const persistedIds = new Set(conversation.messages.map((message) => message.id));
        for (const id of liveRef.current.keys()) {
          if (!persistedIds.has(id)) liveRef.current.delete(id);
        }
        setMessages(
          conversation.messages.map((message) => {
            const threadMessage = toThreadMessage(message);
            const live = liveRef.current.get(message.id);
            if (live && (live.reasoning || live.tools.size > 0) && message.role === "assistant") {
              const liveExtras = buildLiveContent(live).filter((part) => part.type !== "text");
              const baseContent = Array.isArray(threadMessage.content)
                ? threadMessage.content
                : [{ type: "text" as const, text: threadMessage.content }];
              return { ...threadMessage, content: [...liveExtras, ...baseContent] };
            }
            return threadMessage;
          }),
        );
      } else if (envelope.type === "conversations.state") {
        setConversations(envelope.payload.conversations);
        setActiveConversationId(envelope.payload.activeConversationId);
      } else if (envelope.type === "action.result") {
        if (envelope.payload.text) {
          appendDelta(envelope.id, envelope.payload.text);
        }
      }
    };

    port.onMessage.addListener(listener);
    port.postMessage(makeEnvelope("request", "conversation.get", {}));
    port.postMessage(makeEnvelope("request", "conversations.list", {}));
    return () => port.disconnect();
  }, []);

  const runtime = useExternalStoreRuntime({
    messages,
    isRunning,
    convertMessage: (message) => message,
    adapters: {
      threadList: toThreadListAdapter(conversations, activeConversationId, {
        onNew: () => {
          portRef.current?.postMessage(makeEnvelope("request", "conversations.new", {}));
        },
        onSelect: (conversationId) => {
          portRef.current?.postMessage(
            makeEnvelope("request", "conversations.select", { conversationId }),
          );
        },
        onDelete: (conversationId) => {
          portRef.current?.postMessage(
            makeEnvelope("request", "conversations.delete", { conversationId }),
          );
        },
      }),
    },
    onCancel: async () => {
      portRef.current?.postMessage(makeEnvelope("request", "chat.cancel", {}));
    },
    onReload: async () => {
      portRef.current?.postMessage(makeEnvelope("request", "chat.regenerate", {}));
    },
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
      portRef.current?.postMessage(
        makeEnvelope("request", "chat.send", {
          text,
          tabId: tabIdRef.current,
          conversationId: "",
        }),
      );
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
      diagnosticsConsentRequired,
      grantDiagnosticsConsent: () => {
        setDiagnosticsConsentRequired(false);
        portRef.current?.postMessage(
          makeEnvelope("request", "diagnostics.consent", { granted: true }),
        );
      },
      agentState,
      isRunning,
      pendingPermission,
      resolvePermission: (optionId: string | null) => {
        if (!pendingPermission) return;
        portRef.current?.postMessage(
          makeEnvelope("request", "permission.response", {
            requestId: pendingPermission.requestId,
            optionId,
          }),
        );
        setPendingPermission(null);
      },
      conversations,
      activeConversationId,
      requestConversations: () => {
        portRef.current?.postMessage(makeEnvelope("request", "conversations.list", {}));
      },
      selectConversation: (conversationId: string) => {
        portRef.current?.postMessage(
          makeEnvelope("request", "conversations.select", { conversationId }),
        );
      },
      newConversation: () => {
        portRef.current?.postMessage(makeEnvelope("request", "conversations.new", {}));
      },
      deleteConversation: (conversationId: string) => {
        portRef.current?.postMessage(
          makeEnvelope("request", "conversations.delete", { conversationId }),
        );
      },
    }),
    [
      runtime,
      consentRequired,
      diagnosticsConsentRequired,
      agentState,
      isRunning,
      pendingPermission,
      conversations,
      activeConversationId,
    ],
  );
}
