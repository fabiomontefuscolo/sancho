import {
  AssistantRuntimeProvider,
  ComposerPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
} from "@assistant-ui/react";
import { useSanchoRuntime } from "../hooks/useSanchoRuntime";
import "./chat.css";

function UserMessage() {
  return (
    <MessagePrimitive.Root className="sancho-message sancho-message-user">
      <MessagePrimitive.Parts />
    </MessagePrimitive.Root>
  );
}

function AssistantMessage() {
  return (
    <MessagePrimitive.Root className="sancho-message sancho-message-assistant">
      <MessagePrimitive.Parts />
    </MessagePrimitive.Root>
  );
}

export function ChatPanel({ tabId }: { tabId: number }) {
  const { runtime, consentRequired, grantConsent, toolActivity } = useSanchoRuntime(tabId);

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <div className="sancho-chat-root">
        {consentRequired && (
          <div className="sancho-consent-banner">
            <span>The agent wants to capture a screenshot of this page.</span>
            <button onClick={grantConsent}>Allow screenshots</button>
          </div>
        )}
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
      </div>
    </AssistantRuntimeProvider>
  );
}
