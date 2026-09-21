import { createContext, useContext, useEffect } from "react";
import { ThreadListItemPrimitive, ThreadListPrimitive } from "@assistant-ui/react";

export interface ConversationListProps {
  onBack: () => void;
  onNavigate: () => void;
}

const NavigateContext = createContext<() => void>(() => {});

function ConversationListItem() {
  const onNavigate = useContext(NavigateContext);
  return (
    <ThreadListItemPrimitive.Root className="sancho-conversation-entry">
      <ThreadListItemPrimitive.Trigger className="sancho-conversation-select" onClick={onNavigate}>
        <ThreadListItemPrimitive.Title fallback="Untitled conversation" />
      </ThreadListItemPrimitive.Trigger>
      <ThreadListItemPrimitive.Delete
        aria-label="Delete conversation"
        className="sancho-conversation-delete"
      >
        ✕
      </ThreadListItemPrimitive.Delete>
    </ThreadListItemPrimitive.Root>
  );
}

export function ConversationList({ onBack, onNavigate }: ConversationListProps) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onBack();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onBack]);

  return (
    <div className="sancho-conversation-list">
      <div className="sancho-list-topbar">
        <button aria-label="Back to chat" className="sancho-icon-button" onClick={onBack}>
          ←
        </button>
        <span className="sancho-list-title">Conversations</span>
      </div>
      <NavigateContext.Provider value={onNavigate}>
        <ThreadListPrimitive.Root className="sancho-conversation-entries">
          <ThreadListPrimitive.New className="sancho-new-conversation" onClick={onNavigate}>
            + New conversation
          </ThreadListPrimitive.New>
          <ThreadListPrimitive.Items components={{ ThreadListItem: ConversationListItem }} />
        </ThreadListPrimitive.Root>
      </NavigateContext.Provider>
    </div>
  );
}
