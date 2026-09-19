import { DEFAULT_MAX_ITERATIONS, type AgentSession } from "../types";

const API_KEY_PREFIX = "apiKey:";
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
