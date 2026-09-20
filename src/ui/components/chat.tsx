import { useState } from "react";
import {
  AssistantRuntimeProvider,
  ComposerPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
  useMessage,
} from "@assistant-ui/react";
import { useSanchoRuntime } from "../hooks/useSanchoRuntime";
import { formatMessageTime } from "../utils/format-time";
import { MarkdownText } from "./markdown-text";
import { ConversationList } from "./conversation-list";
import "./chat.css";

function MessageTimestamp() {
  const createdAt = useMessage((state) => state.createdAt);
  const epochMs = createdAt instanceof Date ? createdAt.getTime() : Number.NaN;
  if (Number.isNaN(epochMs)) return null;
  return <div className="sancho-message-time">{formatMessageTime(epochMs)}</div>;
}

function UserMessage() {
  return (
    <MessagePrimitive.Root className="sancho-message sancho-message-user">
      <MessagePrimitive.Parts />
      <MessageTimestamp />
    </MessagePrimitive.Root>
  );
}

function AssistantMessage() {
  return (
    <MessagePrimitive.Root className="sancho-message sancho-message-assistant">
      <MessagePrimitive.Parts components={{ Text: MarkdownText }} />
      <MessageTimestamp />
    </MessagePrimitive.Root>
  );
}

export function ChatPanel({ tabId }: { tabId: number }) {
  const {
    runtime,
    consentRequired,
    grantConsent,
    toolActivity,
    pendingPermission,
    resolvePermission,
    conversations,
    activeConversationId,
    requestConversations,
    selectConversation,
    newConversation,
    deleteConversation,
  } = useSanchoRuntime(tabId);
  const [view, setView] = useState<"chat" | "list">("chat");

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <div className="sancho-chat-root">
        <div className="sancho-topbar">
          <button
            aria-label="Open conversations"
            className="sancho-icon-button"
            onClick={() => {
              requestConversations();
              setView("list");
            }}
          >
            ☰
          </button>
        </div>
        {pendingPermission && (
          <div className="sancho-consent-banner" role="alert">
            <span>The agent requests permission: {pendingPermission.title}</span>
            {pendingPermission.options.map((option) => (
              <button key={option.optionId} onClick={() => resolvePermission(option.optionId)}>
                {option.name}
              </button>
            ))}
            <button onClick={() => resolvePermission(null)}>Deny</button>
          </div>
        )}
        {consentRequired && (
          <div className="sancho-consent-banner">
            <span>The agent wants to capture a screenshot of this page.</span>
            <button onClick={grantConsent}>Allow screenshots</button>
          </div>
        )}
        {view === "list" ? (
          <ConversationList
            conversations={conversations}
            activeConversationId={activeConversationId}
            onSelect={(conversationId) => {
              selectConversation(conversationId);
              setView("chat");
            }}
            onNew={() => {
              newConversation();
              setView("chat");
            }}
            onDelete={(conversationId) => {
              deleteConversation(conversationId);
              if (conversationId === activeConversationId) setView("chat");
            }}
            onBack={() => setView("chat")}
          />
        ) : (
          <>
            <ThreadPrimitive.Root className="sancho-thread">
              <ThreadPrimitive.Viewport className="sancho-viewport">
                <ThreadPrimitive.Empty>
                  <div className="sancho-empty">Ask the agent anything about this page.</div>
                </ThreadPrimitive.Empty>
                <ThreadPrimitive.Messages components={{ UserMessage, AssistantMessage }} />
              </ThreadPrimitive.Viewport>
            </ThreadPrimitive.Root>
            {toolActivity.length > 0 && (
              <div className="sancho-activity">
                {toolActivity.map((entry, index) => (
                  <div key={index} className="sancho-activity-entry">
                    {entry}
                  </div>
                ))}
              </div>
            )}
            <ComposerPrimitive.Root className="sancho-composer">
              <ComposerPrimitive.Input
                aria-label="Message"
                placeholder="Message the agent…"
                className="sancho-input"
              />
              <ComposerPrimitive.Send aria-label="Send" className="sancho-send">
                Send
              </ComposerPrimitive.Send>
            </ComposerPrimitive.Root>
          </>
        )}
      </div>
    </AssistantRuntimeProvider>
  );
}
