import { beforeEach, describe, expect, it, vi } from "vitest";
import { installMockChrome } from "./helpers/mock-chrome";
import {
  createConversation,
  deleteConversation,
  deriveTitle,
  ensureMigrated,
  getActiveConversation,
  getActiveConversationId,
  getConversation,
  listConversations,
  saveConversationRecord,
  setActiveConversation,
} from "../../src/storage/conversations";
import type { Conversation, Message } from "../../src/types";

function userMessage(text: string): Message {
  return {
    id: crypto.randomUUID(),
    role: "user",
    parts: [{ type: "text", text }],
    tabId: 1,
    createdAt: Date.now(),
  };
}

function legacyConversation(messages: Message[]): Conversation {
  const now = Date.now() - 1000;
  return {
    id: "global",
    title: "New conversation",
    messages,
    screenshotConsent: true,
    diagnosticsConsent: false,
    acpSessionId: null,
    createdAt: now,
    updatedAt: now,
  };
}

describe("conversations store", () => {
  let stores: { local: Record<string, unknown> };

  beforeEach(() => {
    ({ stores } = installMockChrome());
  });

  it("creates an empty conversation, sets it active, and indexes it", async () => {
    const created = await createConversation();
    expect(created.title).toBe("New conversation");
    expect(created.messages).toEqual([]);
    expect(await getActiveConversationId()).toBe(created.id);
    const list = await listConversations();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      id: created.id,
      title: "New conversation",
      messageCount: 0,
    });
    expect(created.updatedAt).toBeGreaterThanOrEqual(created.createdAt);
  });

  it("derives title from the first user message on save", async () => {
    const created = await createConversation();
    const saved = await saveConversationRecord({
      ...created,
      messages: [userMessage("  tell me   about\nrecursion please  ")],
    });
    expect(saved.title).toBe("tell me about recursion please");
    const list = await listConversations();
    expect(list[0]?.title).toBe("tell me about recursion please");
    expect(list[0]?.messageCount).toBe(1);
    expect(saved.updatedAt).toBeGreaterThanOrEqual(created.updatedAt);
  });

  it("truncates titles at 40 characters with ellipsis", () => {
    const long = "a".repeat(60);
    const title = deriveTitle([userMessage(long)]);
    expect(title).toHaveLength(40);
    expect(title.endsWith("…")).toBe(true);
  });

  it("keeps placeholder title when there is no user message", () => {
    expect(deriveTitle([])).toBe("New conversation");
    expect(
      deriveTitle([
        {
          id: "m",
          role: "assistant",
          parts: [{ type: "text", text: "hi" }],
          tabId: null,
          createdAt: 1,
        },
      ]),
    ).toBe("New conversation");
  });

  it("does not overwrite an existing title on later saves", async () => {
    const created = await createConversation();
    const first = await saveConversationRecord({ ...created, messages: [userMessage("first")] });
    const second = await saveConversationRecord({
      ...first,
      messages: [...first.messages, userMessage("second")],
    });
    expect(second.title).toBe("first");
  });

  it("lists conversations sorted by updatedAt descending", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    const a = await createConversation();
    vi.setSystemTime(2000);
    const b = await createConversation();
    await setActiveConversation(a.id);
    vi.setSystemTime(3000);
    await saveConversationRecord({ ...a, messages: [userMessage("bump a")] });
    const list = await listConversations();
    expect(list.map((entry) => entry.id)).toEqual([a.id, b.id]);
    vi.useRealTimers();
  });

  it("sets active conversation and rejects unknown ids", async () => {
    const a = await createConversation();
    const b = await createConversation();
    expect(await setActiveConversation(a.id)).toBe(true);
    expect(await getActiveConversationId()).toBe(a.id);
    expect(await setActiveConversation("nope")).toBe(false);
    expect(await getActiveConversationId()).toBe(a.id);
    expect(b.id).not.toBe(a.id);
  });

  it("getActiveConversation creates one when none exists", async () => {
    const active = await getActiveConversation();
    expect(active.messages).toEqual([]);
    expect(await getActiveConversationId()).toBe(active.id);
  });

  it("deletes a record and its index entry; clears active pointer if active", async () => {
    const a = await createConversation();
    const b = await createConversation();
    await deleteConversation(b.id);
    expect(await getConversation(b.id)).toBeNull();
    expect((await listConversations()).map((entry) => entry.id)).toEqual([a.id]);
    expect(await getActiveConversationId()).toBeNull();

    await deleteConversation(a.id);
    expect(await listConversations()).toEqual([]);
  });

  it("migrates the legacy single conversation once, preserving data", async () => {
    stores.local["conversation"] = legacyConversation([userMessage("legacy hello")]);
    await ensureMigrated();
    const list = await listConversations();
    expect(list).toHaveLength(1);
    expect(list[0]?.title).toBe("legacy hello");
    const record = await getConversation(list[0]?.id ?? "");
    expect(record?.messages).toHaveLength(1);
    expect(record?.screenshotConsent).toBe(true);
    expect(await getActiveConversationId()).toBe(list[0]?.id);
    expect("conversation" in stores.local).toBe(false);

    await ensureMigrated();
    expect(await listConversations()).toHaveLength(1);
  });

  it("seeds an empty index when no legacy record exists", async () => {
    await ensureMigrated();
    expect(await listConversations()).toEqual([]);
  });
});
