import { createContext, useContext, useState } from "react";
import {
  AssistantRuntimeProvider,
  AuiIf,
  ComposerPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
  useAuiState,
} from "@assistant-ui/react";
import { ArrowUp, Square } from "lucide-react";
import { useSanchoRuntime } from "../hooks/useSanchoRuntime";
import { formatMessageTime } from "../utils/format-time";
import { MarkdownText } from "./markdown-text";
import { CopyButton } from "./copy-button";

const RawTextContext = createContext<(messageId: string) => string>(() => "");

function MessageCopyButton() {
  const getRawText = useContext(RawTextContext);
  const id = useAuiState((state) => state.message.id);
  return (
    <CopyButton
      className="sancho-message-copy"
      label="Copy message"
      getText={() => getRawText(id)}
    />
  );
}
import { ConversationList } from "./conversation-list";
import { SettingsView } from "./settings-view";
import { useUiPrefs } from "../hooks/use-ui-prefs";
import "./chat.css";

function MessageTimestamp() {
  const createdAt = useAuiState((state) => state.message.createdAt);
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
      <MessageCopyButton />
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
    agentState,
    isRunning,
    pendingPermission,
    resolvePermission,
    conversations,
    activeConversationId,
    requestConversations,
    selectConversation,
    newConversation,
    deleteConversation,
    getMessageRawText,
  } = useSanchoRuntime(tabId);
  const { prefs, setFontSize } = useUiPrefs();
  const [view, setView] = useState<"chat" | "list" | "settings">("chat");

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <RawTextContext.Provider value={getMessageRawText}>
        <div className={`sancho-chat-root sancho-font-${prefs.fontSize}`}>
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
            <button
              aria-label="Open settings"
              className="sancho-icon-button"
              onClick={() => setView("settings")}
            >
              ⚙
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
          {view === "settings" ? (
            <SettingsView prefs={prefs} onFontSize={setFontSize} onBack={() => setView("chat")} />
          ) : view === "list" ? (
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
              {(agentState || isRunning) && (
                <div className="sancho-status" role="status" aria-live="polite">
                  <span className="sancho-status-dot" />
                  {agentState === "acting"
                    ? `Working: ${toolActivity[toolActivity.length - 1] ?? "tool"}`
                    : agentState === "verifying"
                      ? "Checking results…"
                      : "Thinking…"}
                </div>
              )}
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
                  rows={1}
                />
                <div className="sancho-composer-actions">
                  <AuiIf condition={(state) => state.thread.isRunning}>
                    <ComposerPrimitive.Cancel aria-label="Stop generating" className="sancho-send">
                      <Square size={14} fill="currentColor" />
                    </ComposerPrimitive.Cancel>
                  </AuiIf>
                  <AuiIf condition={(state) => !state.thread.isRunning}>
                    <ComposerPrimitive.Send aria-label="Send" className="sancho-send">
                      <ArrowUp size={16} />
                    </ComposerPrimitive.Send>
                  </AuiIf>
                </div>
              </ComposerPrimitive.Root>
            </>
          )}
        </div>
      </RawTextContext.Provider>
    </AssistantRuntimeProvider>
  );
}
