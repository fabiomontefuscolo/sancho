import { beforeEach, describe, expect, it, vi } from "vitest";
import { installMockChrome } from "./helpers/mock-chrome";
import { BaseLLMProvider, type StreamEvents } from "../../src/providers/base";

vi.mock("../../src/providers/factory", async () => {
  const actual = await vi.importActual<typeof import("../../src/providers/factory")>(
    "../../src/providers/factory",
  );
  return { ...actual, createProvider: vi.fn() };
});

import { createProvider } from "../../src/providers/factory";
import {
  handleChatSend,
  handleConversationsDelete,
  handleConversationsList,
  handleConversationsNew,
  handleConversationsSelect,
} from "../../src/agent/chat-handler";
import {
  createConversation,
  getActiveConversationId,
  getConversation,
  listConversations,
} from "../../src/storage/conversations";
import type { AnyEnvelope } from "../../src/bridge/messages";

class EchoProvider extends BaseLLMProvider {
  readonly id = "echo";
  async streamChat(
    messages: { role: string; content: string }[],
    _tools: never[],
    events: StreamEvents,
  ) {
    events.onDelta(`echo: ${messages[messages.length - 1]?.content}`);
    events.onDone();
  }
}

function makePort() {
  const posted: AnyEnvelope[] = [];
  return {
    posted,
    postMessage: (message: unknown) => posted.push(message as AnyEnvelope),
  } as unknown as chrome.runtime.Port & { posted: AnyEnvelope[] };
}

describe("conversation handlers", () => {
  beforeEach(() => {
    installMockChrome();
    vi.mocked(createProvider).mockResolvedValue(new EchoProvider());
  });

  it("conversations.list emits sorted summaries with the active id", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    const a = await createConversation();
    vi.setSystemTime(2000);
    const b = await createConversation();
    vi.useRealTimers();
    await createConversation();
    const port = makePort();
    await handleConversationsList(port);
    const state = port.posted.find((envelope) => envelope.type === "conversations.state");
    expect(state).toBeTruthy();
    const payload = state?.payload as {
      conversations: Array<{ id: string }>;
      activeConversationId: string;
    };
    expect(payload.activeConversationId).toBe(await getActiveConversationId());
    const ids = payload.conversations.map((entry) => entry.id);
    expect(ids).toContain(a.id);
    expect(ids).toContain(b.id);
    expect(ids[0]).toBe(payload.activeConversationId);
  });

  it("conversations.select switches active and emits its history", async () => {
    const a = await createConversation();
    const b = await createConversation();
    const port = makePort();
    await handleConversationsSelect({ conversationId: a.id }, port);
    expect(await getActiveConversationId()).toBe(a.id);
    const state = port.posted.find((envelope) => envelope.type === "conversation.state");
    expect((state?.payload as { id: string }).id).toBe(a.id);
    void b;
  });

  it("conversations.select with unknown id errors and keeps active unchanged", async () => {
    const a = await createConversation();
    const port = makePort();
    await handleConversationsSelect({ conversationId: "nope" }, port);
    expect(await getActiveConversationId()).toBe(a.id);
    expect(
      port.posted.some(
        (envelope) =>
          envelope.type === "chat.error" && envelope.payload.message === "unknown conversation",
      ),
    ).toBe(true);
  });

  it("conversations.new creates and activates an empty conversation", async () => {
    const before = await createConversation();
    const port = makePort();
    await handleConversationsNew(port);
    const activeId = await getActiveConversationId();
    expect(activeId).not.toBe(before.id);
    const state = port.posted.find((envelope) => envelope.type === "conversation.state");
    expect((state?.payload as { id: string; messages: unknown[] }).messages).toEqual([]);
    expect((await listConversations()).map((entry) => entry.id)).toContain(before.id);
  });

  it("chat.send appends only to the addressed conversation and tags events", async () => {
    const a = await createConversation();
    const b = await createConversation();
    const port = makePort();
    await handleChatSend({ text: "for b", tabId: 1, conversationId: b.id }, port);

    const aRecord = await getConversation(a.id);
    const bRecord = await getConversation(b.id);
    expect(aRecord?.messages).toHaveLength(0);
    expect(bRecord?.messages).toHaveLength(2);

    const deltas = port.posted.filter((envelope) => envelope.type === "chat.delta");
    expect(deltas.length).toBeGreaterThan(0);
    for (const delta of deltas) {
      expect((delta.payload as { conversationId: string }).conversationId).toBe(b.id);
    }
    const done = port.posted.find((envelope) => envelope.type === "chat.done");
    expect((done?.payload as { conversationId: string }).conversationId).toBe(b.id);
  });

  it("conversations.delete on non-active conversation keeps active unchanged", async () => {
    const a = await createConversation();
    const b = await createConversation();
    const port = makePort();
    await handleConversationsDelete({ conversationId: a.id }, port);
    expect(await getConversation(a.id)).toBeNull();
    expect(await getActiveConversationId()).toBe(b.id);
    const state = port.posted.find((envelope) => envelope.type === "conversations.state");
    expect(
      (state?.payload as { conversations: Array<{ id: string }> }).conversations.map(
        (entry) => entry.id,
      ),
    ).not.toContain(a.id);
  });

  it("conversations.delete on active conversation creates a fresh empty one", async () => {
    const a = await createConversation();
    const port = makePort();
    await handleConversationsDelete({ conversationId: a.id }, port);
    const activeId = await getActiveConversationId();
    expect(activeId).toBeTruthy();
    expect(activeId).not.toBe(a.id);
    const fresh = await getConversation(activeId ?? "");
    expect(fresh?.messages).toEqual([]);
    const state = port.posted.find((envelope) => envelope.type === "conversation.state");
    expect((state?.payload as { id: string }).id).toBe(activeId);
  });

  it("deleting the only conversation behaves as delete-active", async () => {
    const a = await createConversation();
    const port = makePort();
    await handleConversationsDelete({ conversationId: a.id }, port);
    const list = await listConversations();
    expect(list).toHaveLength(1);
    expect(list[0]?.id).not.toBe(a.id);
  });

  it("does not emit conversation.state for a run in a backgrounded conversation", async () => {
    const a = await createConversation();
    await createConversation();
    const port = makePort();
    await handleChatSend({ text: "for a", tabId: 1, conversationId: a.id }, port);
    const states = port.posted.filter((envelope) => envelope.type === "conversation.state");
    expect(states).toEqual([]);
    const deltas = port.posted.filter((envelope) => envelope.type === "chat.delta");
    expect(deltas.length).toBeGreaterThan(0);
    expect((await getConversation(a.id))?.messages).toHaveLength(2);
  });

  it("chat.cancel aborts the active conversation's run and tags chat.done with its id", async () => {
    const a = await createConversation();
    const { handleChatCancel } = await import("../../src/agent/chat-handler");
    const port = makePort();
    await handleChatCancel(port);
    const done = port.posted.find((envelope) => envelope.type === "chat.done");
    expect((done?.payload as { conversationId: string }).conversationId).toBe(a.id);
  });

  it("does not resume another conversation's agent session", async () => {
    const a = await createConversation();
    const b = await createConversation();
    const { newAgentSession, saveAgentSession } = await import("../../src/storage/local");
    const stale = newAgentSession(a.id);
    stale.iteration = stale.maxIterations;
    await saveAgentSession(stale);

    const port = makePort();
    await handleChatSend({ text: "for b", tabId: 1, conversationId: b.id }, port);
    const deltas = port.posted
      .filter((envelope) => envelope.type === "chat.delta")
      .map((envelope) => String(envelope.payload.text))
      .join("");
    expect(deltas).toContain("echo:");
    expect(deltas).not.toContain("safety limit");
  });
});
