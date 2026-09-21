import type { ExternalStoreThreadListAdapter } from "@assistant-ui/react";
import type { ConversationSummary } from "../types";

export interface ThreadListHandlers {
  onNew: () => void;
  onSelect: (conversationId: string) => void;
  onDelete: (conversationId: string) => void;
}

export function toThreadListAdapter(
  conversations: ConversationSummary[],
  activeConversationId: string,
  handlers: ThreadListHandlers,
): ExternalStoreThreadListAdapter {
  return {
    threadId: activeConversationId,
    threads: conversations.map((conversation) => ({
      status: "regular" as const,
      id: conversation.id,
      title: conversation.title,
    })),
    onSwitchToNewThread: handlers.onNew,
    onSwitchToThread: handlers.onSelect,
    onDelete: handlers.onDelete,
  };
}
