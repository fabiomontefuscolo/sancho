import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChatPanel } from "../../src/ui/components/chat";
import { installMockPort, type MockPort } from "./helpers/mock-port";

const CONVERSATIONS = [
  { id: "c-new", title: "newer chat", updatedAt: 2000, createdAt: 1500, messageCount: 2 },
  { id: "c-old", title: "older chat", updatedAt: 1000, createdAt: 500, messageCount: 4 },
];

function emitConversationsState(port: MockPort) {
  port.emit({
    kind: "event",
    type: "conversations.state",
    id: "s1",
    payload: { conversations: CONVERSATIONS, activeConversationId: "c-new" },
  });
}

function emitConversationState(port: MockPort, id: string, title: string, text: string) {
  port.emit({
    kind: "event",
    type: "conversation.state",
    id: "s2",
    payload: {
      id,
      title,
      messages: [
        {
          id: "m1",
          role: "user",
          parts: [{ type: "text", text }],
          tabId: 7,
          createdAt: 1000,
        },
      ],
      screenshotConsent: false,
      acpSessionId: null,
      createdAt: 500,
      updatedAt: 1000,
    },
  });
}

async function openList(port: MockPort) {
  await userEvent.click(screen.getByRole("button", { name: /open conversations/i }));
  expect(port.sent).toContainEqual(expect.objectContaining({ type: "conversations.list" }));
  emitConversationsState(port);
}

describe("ConversationList", () => {
  let port: MockPort;

  beforeEach(() => {
    port = installMockPort();
  });

  it("hamburger opens the list with entries in received order", async () => {
    render(<ChatPanel tabId={7} />);
    await openList(port);
    const entries = screen.getAllByRole("button", { name: /^(newer|older) chat$/ });
    expect(entries[0]).toHaveTextContent("newer chat");
    expect(entries[1]).toHaveTextContent("older chat");
  });

  it("clicking an entry selects it, closes the list, and renders its history", async () => {
    render(<ChatPanel tabId={7} />);
    await openList(port);
    await userEvent.click(screen.getByRole("button", { name: "older chat" }));
    expect(port.sent).toContainEqual(
      expect.objectContaining({
        type: "conversations.select",
        payload: { conversationId: "c-old" },
      }),
    );
    emitConversationState(port, "c-old", "older chat", "old message text");
    await waitFor(() => expect(screen.getByText("old message text")).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "newer chat" })).not.toBeInTheDocument();
  });

  it("new conversation sends conversations.new and returns to chat view", async () => {
    render(<ChatPanel tabId={7} />);
    await openList(port);
    await userEvent.click(screen.getByRole("button", { name: /new conversation/i }));
    expect(port.sent).toContainEqual(expect.objectContaining({ type: "conversations.new" }));
    expect(screen.queryByRole("button", { name: "older chat" })).not.toBeInTheDocument();
  });

  it("back button closes the list without sending any conversation command", async () => {
    render(<ChatPanel tabId={7} />);
    emitConversationState(port, "c-new", "newer chat", "current text");
    await openList(port);
    const sentBefore = port.sent.length;
    await userEvent.click(screen.getByRole("button", { name: /back to chat/i }));
    expect(screen.queryByRole("button", { name: "older chat" })).not.toBeInTheDocument();
    expect(port.sent.slice(sentBefore)).toEqual([]);
    expect(screen.getByText("current text")).toBeInTheDocument();
  });

  it("Escape closes the list without sending any conversation command", async () => {
    render(<ChatPanel tabId={7} />);
    await openList(port);
    const sentBefore = port.sent.length;
    await userEvent.keyboard("{Escape}");
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "older chat" })).not.toBeInTheDocument(),
    );
    expect(port.sent.slice(sentBefore)).toEqual([]);
  });

  it("delete button sends conversations.delete with the entry id", async () => {
    render(<ChatPanel tabId={7} />);
    await openList(port);
    await userEvent.click(screen.getByRole("button", { name: "Delete older chat" }));
    expect(port.sent).toContainEqual(
      expect.objectContaining({
        type: "conversations.delete",
        payload: { conversationId: "c-old" },
      }),
    );
  });

  it("list refreshes from pushed conversations.state after delete", async () => {
    render(<ChatPanel tabId={7} />);
    await openList(port);
    await userEvent.click(screen.getByRole("button", { name: "Delete older chat" }));
    port.emit({
      kind: "event",
      type: "conversations.state",
      id: "s3",
      payload: {
        conversations: [CONVERSATIONS[0]],
        activeConversationId: "c-new",
      },
    });
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "older chat" })).not.toBeInTheDocument(),
    );
    expect(screen.getByRole("button", { name: "newer chat" })).toBeInTheDocument();
  });
});
