import {
  DEFAULT_MAX_ITERATIONS,
  GLOBAL_CONVERSATION_ID,
  type AgentSession,
  type Conversation,
} from "../types";

const API_KEY_PREFIX = "apiKey:";
const CONVERSATION_KEY = "conversation";
const SESSION_KEY = "agentSession";

export async function saveApiKey(ref: string, key: string): Promise<void> {
  await chrome.storage.local.set({ [API_KEY_PREFIX + ref]: { key } });
}

export async function getApiKey(ref: string): Promise<string | null> {
  const result = await chrome.storage.local.get(API_KEY_PREFIX + ref);
  const record = result[API_KEY_PREFIX + ref] as { key: string } | undefined;
  return record?.key ?? null;
}

export async function deleteApiKey(ref: string): Promise<void> {
  await chrome.storage.local.remove(API_KEY_PREFIX + ref);
}

export function emptyConversation(): Conversation {
  const now = Date.now();
  return {
    id: GLOBAL_CONVERSATION_ID,
    title: "New conversation",
    messages: [],
    screenshotConsent: false,
    acpSessionId: null,
    createdAt: now,
    updatedAt: now,
  };
}

export async function getConversation(): Promise<Conversation> {
  const result = await chrome.storage.local.get(CONVERSATION_KEY);
  return (result[CONVERSATION_KEY] as Conversation | undefined) ?? emptyConversation();
}

export async function saveConversation(conversation: Conversation): Promise<void> {
  await chrome.storage.local.set({
    [CONVERSATION_KEY]: { ...conversation, updatedAt: Date.now() },
  });
}

export async function clearConversation(): Promise<Conversation> {
  const fresh = emptyConversation();
  await chrome.storage.local.set({ [CONVERSATION_KEY]: fresh });
  return fresh;
}

export async function getAgentSession(): Promise<AgentSession | null> {
  const result = await chrome.storage.local.get(SESSION_KEY);
  return (result[SESSION_KEY] as AgentSession | undefined) ?? null;
}

export async function saveAgentSession(session: AgentSession): Promise<void> {
  await chrome.storage.local.set({ [SESSION_KEY]: session });
}

export function newAgentSession(conversationId: string): AgentSession {
  return {
    conversationId,
    state: "idle",
    iteration: 0,
    maxIterations: DEFAULT_MAX_ITERATIONS,
    pendingToolCall: null,
  };
}

export async function clearAgentSession(): Promise<void> {
  await chrome.storage.local.remove(SESSION_KEY);
}
