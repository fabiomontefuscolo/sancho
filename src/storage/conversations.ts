import type { Conversation, ConversationSummary, Message } from "../types";

const RECORD_PREFIX = "conversation:";
const INDEX_KEY = "conversations.index";
const ACTIVE_KEY = "activeConversationId";
const LEGACY_KEY = "conversation";
const TITLE_MAX_LENGTH = 40;
const PLACEHOLDER_TITLE = "New conversation";

export function deriveTitle(messages: Message[]): string {
  const firstUser = messages.find((message) => message.role === "user");
  if (!firstUser) return PLACEHOLDER_TITLE;
  const text = firstUser.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return PLACEHOLDER_TITLE;
  return text.length > TITLE_MAX_LENGTH ? `${text.slice(0, TITLE_MAX_LENGTH - 1)}…` : text;
}

async function readIndex(): Promise<ConversationSummary[] | null> {
  const result = await chrome.storage.local.get(INDEX_KEY);
  return (result[INDEX_KEY] as ConversationSummary[] | undefined) ?? null;
}

async function writeIndex(index: ConversationSummary[]): Promise<void> {
  await chrome.storage.local.set({ [INDEX_KEY]: index });
}

function summarize(conversation: Conversation): ConversationSummary {
  return {
    id: conversation.id,
    title: conversation.title,
    updatedAt: conversation.updatedAt,
    createdAt: conversation.createdAt,
    messageCount: conversation.messages.length,
  };
}

async function migrateLegacy(): Promise<void> {
  const existing = await readIndex();
  if (existing) return;
  const result = await chrome.storage.local.get(LEGACY_KEY);
  const legacy = result[LEGACY_KEY] as Conversation | undefined;
  if (!legacy) return;
  const migrated: Conversation = {
    ...legacy,
    id: crypto.randomUUID(),
    title: deriveTitle(legacy.messages),
    acpSessionId: legacy.acpSessionId ?? null,
  };
  await chrome.storage.local.set({
    [RECORD_PREFIX + migrated.id]: migrated,
    [ACTIVE_KEY]: migrated.id,
  });
  await writeIndex([summarize(migrated)]);
  await chrome.storage.local.remove(LEGACY_KEY);
}

export async function ensureMigrated(): Promise<void> {
  await migrateLegacy();
}

export async function listConversations(): Promise<ConversationSummary[]> {
  await migrateLegacy();
  const index = (await readIndex()) ?? [];
  return [...index].sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getConversation(id: string): Promise<Conversation | null> {
  await migrateLegacy();
  const result = await chrome.storage.local.get(RECORD_PREFIX + id);
  return (result[RECORD_PREFIX + id] as Conversation | undefined) ?? null;
}

export async function getActiveConversationId(): Promise<string | null> {
  await migrateLegacy();
  const result = await chrome.storage.local.get(ACTIVE_KEY);
  const id = result[ACTIVE_KEY] as string | undefined;
  if (!id) return null;
  const record = await getConversation(id);
  return record ? id : null;
}

export async function getActiveConversation(): Promise<Conversation> {
  const id = await getActiveConversationId();
  if (id) {
    const record = await getConversation(id);
    if (record) return record;
  }
  return createConversation();
}

export async function setActiveConversation(id: string): Promise<boolean> {
  const record = await getConversation(id);
  if (!record) return false;
  await chrome.storage.local.set({ [ACTIVE_KEY]: id });
  return true;
}

export async function createConversation(): Promise<Conversation> {
  await migrateLegacy();
  const now = Date.now();
  const conversation: Conversation = {
    id: crypto.randomUUID(),
    title: PLACEHOLDER_TITLE,
    messages: [],
    screenshotConsent: false,
    acpSessionId: null,
    createdAt: now,
    updatedAt: now,
  };
  await chrome.storage.local.set({
    [RECORD_PREFIX + conversation.id]: conversation,
    [ACTIVE_KEY]: conversation.id,
  });
  const index = (await readIndex()) ?? [];
  await writeIndex([...index, summarize(conversation)]);
  return conversation;
}

export async function saveConversationRecord(conversation: Conversation): Promise<Conversation> {
  const updated: Conversation = {
    ...conversation,
    title:
      conversation.title === PLACEHOLDER_TITLE
        ? deriveTitle(conversation.messages)
        : conversation.title,
    updatedAt: Date.now(),
  };
  await chrome.storage.local.set({ [RECORD_PREFIX + updated.id]: updated });
  const index = (await readIndex()) ?? [];
  const rest = index.filter((entry) => entry.id !== updated.id);
  await writeIndex([...rest, summarize(updated)]);
  return updated;
}

export async function deleteConversation(id: string): Promise<void> {
  await migrateLegacy();
  await chrome.storage.local.remove(RECORD_PREFIX + id);
  const index = (await readIndex()) ?? [];
  await writeIndex(index.filter((entry) => entry.id !== id));
  const active = await getActiveConversationId();
  if (active === id) {
    await chrome.storage.local.remove(ACTIVE_KEY);
  }
}
