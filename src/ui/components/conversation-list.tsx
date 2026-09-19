import { useEffect } from "react";
import type { ConversationSummary } from "../../types";

export interface ConversationListProps {
  conversations: ConversationSummary[];
  activeConversationId: string;
  onSelect: (conversationId: string) => void;
  onNew: () => void;
  onDelete: (conversationId: string) => void;
  onBack: () => void;
}

export function ConversationList({
  conversations,
  activeConversationId,
  onSelect,
  onNew,
  onDelete,
  onBack,
}: ConversationListProps) {
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
      <button className="sancho-new-conversation" onClick={onNew}>
        + New conversation
      </button>
      <ul className="sancho-conversation-entries">
        {conversations.map((conversation) => (
          <li key={conversation.id} className="sancho-conversation-entry">
            <button
              className={
                conversation.id === activeConversationId
                  ? "sancho-conversation-select sancho-conversation-active"
                  : "sancho-conversation-select"
              }
              onClick={() => onSelect(conversation.id)}
            >
              {conversation.title}
            </button>
            <button
              aria-label={`Delete ${conversation.title}`}
              className="sancho-conversation-delete"
              onClick={() => onDelete(conversation.id)}
            >
              ✕
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
