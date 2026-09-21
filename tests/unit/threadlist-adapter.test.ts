import { describe, expect, it, vi } from "vitest";
import { toThreadListAdapter } from "../../src/ui/threadlist-adapter";
import type { ConversationSummary } from "../../src/types";

const CONVERSATIONS: ConversationSummary[] = [
  { id: "c-new", title: "newer chat", updatedAt: 2000, createdAt: 1500, messageCount: 2 },
  { id: "c-old", title: "older chat", updatedAt: 1000, createdAt: 500, messageCount: 4 },
];

function makeHandlers() {
  return { onNew: vi.fn(), onSelect: vi.fn(), onDelete: vi.fn() };
}

describe("toThreadListAdapter", () => {
  it("maps conversations to regular threads with titles in order", () => {
    const adapter = toThreadListAdapter(CONVERSATIONS, "c-new", makeHandlers());
    expect(adapter.threads).toEqual([
      { status: "regular", id: "c-new", title: "newer chat" },
      { status: "regular", id: "c-old", title: "older chat" },
    ]);
  });

  it("exposes the active conversation as threadId", () => {
    const adapter = toThreadListAdapter(CONVERSATIONS, "c-old", makeHandlers());
    expect(adapter.threadId).toBe("c-old");
  });

  it("delegates new/select/delete to the handlers", () => {
    const handlers = makeHandlers();
    const adapter = toThreadListAdapter(CONVERSATIONS, "c-new", handlers);
    adapter.onSwitchToNewThread?.();
    adapter.onSwitchToThread?.("c-old");
    adapter.onDelete?.("c-old");
    expect(handlers.onNew).toHaveBeenCalledOnce();
    expect(handlers.onSelect).toHaveBeenCalledWith("c-old");
    expect(handlers.onDelete).toHaveBeenCalledWith("c-old");
  });

  it("does not offer archive or rename", () => {
    const adapter = toThreadListAdapter(CONVERSATIONS, "c-new", makeHandlers());
    expect(adapter.onArchive).toBeUndefined();
    expect(adapter.onRename).toBeUndefined();
  });
});
