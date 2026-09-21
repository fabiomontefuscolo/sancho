import { useState, type ReactNode } from "react";
import {
  ActionBarPrimitive,
  AssistantRuntimeProvider,
  AuiIf,
  ComposerPrimitive,
  groupPartByType,
  MessagePrimitive,
  ThreadPrimitive,
  useAuiState,
} from "@assistant-ui/react";
import { ArrowUp, Check, ChevronDown, ChevronRight, Copy, RefreshCw, Square } from "lucide-react";
import { useSanchoRuntime } from "../hooks/useSanchoRuntime";
import { formatMessageTime } from "../utils/format-time";
import { MarkdownText } from "./markdown-text";
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
      <ActionBarPrimitive.Root
        hideWhenRunning
        autohide="not-last"
        autohideFloat="always"
        className="sancho-action-bar"
      >
        <ActionBarPrimitive.Copy aria-label="Copy" className="sancho-action-button">
          <CopyIcon />
        </ActionBarPrimitive.Copy>
      </ActionBarPrimitive.Root>
    </MessagePrimitive.Root>
  );
}

function CopyIcon() {
  return (
    <>
      <Copy size={13} className="sancho-icon-copy" />
      <Check size={13} className="sancho-icon-copied" />
    </>
  );
}

const groupByThought = groupPartByType({
  reasoning: ["group-thought"],
  "tool-call": ["group-thought"],
});

function ThoughtProcessGroup({ running, children }: { running: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="sancho-thought">
      <button
        type="button"
        className="sancho-thought-toggle"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
      >
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        Thought process
        {running ? <span className="sancho-thought-running">thinking…</span> : null}
      </button>
      {open ? <div className="sancho-thought-body">{children}</div> : null}
    </div>
  );
}

function AssistantMessage() {
  return (
    <MessagePrimitive.Root className="sancho-message sancho-message-assistant">
      <MessagePrimitive.GroupedParts groupBy={groupByThought} indicator="never">
        {({ part, children }) => {
          switch (part.type) {
            case "group-thought":
              return (
                <ThoughtProcessGroup running={part.counts.running > 0}>
                  {children}
                </ThoughtProcessGroup>
              );
            case "text":
              return <MarkdownText />;
            case "reasoning":
              return <div className="sancho-reasoning">{part.text}</div>;
            case "tool-call":
              return (
                <div className="sancho-tool-call">
                  <span className="sancho-tool-name">{part.toolName}</span>
                  <span className="sancho-tool-status">
                    {part.status.type === "running" ? "running" : "done"}
                  </span>
                </div>
              );
            case "image":
              return <img className="sancho-message-image" src={part.image} alt="" />;
            default:
              return null;
          }
        }}
      </MessagePrimitive.GroupedParts>
      <MessageTimestamp />
      <ActionBarPrimitive.Root
        hideWhenRunning
        autohide="not-last"
        autohideFloat="always"
        className="sancho-action-bar"
      >
        <ActionBarPrimitive.Copy aria-label="Copy" className="sancho-action-button">
          <CopyIcon />
        </ActionBarPrimitive.Copy>
        <ActionBarPrimitive.Reload aria-label="Regenerate" className="sancho-action-button">
          <RefreshCw size={13} />
        </ActionBarPrimitive.Reload>
      </ActionBarPrimitive.Root>
    </MessagePrimitive.Root>
  );
}

export function ChatPanel({ tabId }: { tabId: number }) {
  const {
    runtime,
    consentRequired,
    grantConsent,
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
  } = useSanchoRuntime(tabId);
  const { prefs, setFontSize } = useUiPrefs();
  const [view, setView] = useState<"chat" | "list" | "settings">("chat");

  return (
    <AssistantRuntimeProvider runtime={runtime}>
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
                  ? "Working…"
                  : agentState === "verifying"
                    ? "Checking results…"
                    : "Thinking…"}
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
    </AssistantRuntimeProvider>
  );
}
