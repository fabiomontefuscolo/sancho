import type { Action, ProviderConfig } from "../types";

const PROVIDER_KEY = "providerConfig";
const ACTIONS_KEY = "actions";

export const DEFAULT_PROVIDER_IDS = ["openai", "kimi", "deepseek", "openrouter", "custom"] as const;

export const DEFAULT_BASE_URLS: Record<string, string> = {
  openai: "https://api.openai.com/v1",
  kimi: "https://api.moonshot.ai/v1",
  deepseek: "https://api.deepseek.com/v1",
  openrouter: "https://openrouter.ai/api/v1",
  custom: "",
};

export async function getProviderConfig(): Promise<ProviderConfig | null> {
  const result = await chrome.storage.sync.get(PROVIDER_KEY);
  return (result[PROVIDER_KEY] as ProviderConfig | undefined) ?? null;
}

export async function saveProviderConfig(config: ProviderConfig): Promise<void> {
  await chrome.storage.sync.set({ [PROVIDER_KEY]: config });
}

export async function listActions(): Promise<Action[]> {
  const result = await chrome.storage.sync.get(ACTIONS_KEY);
  return (result[ACTIONS_KEY] as Action[] | undefined) ?? [];
}

export async function saveActions(actions: Action[]): Promise<void> {
  await chrome.storage.sync.set({ [ACTIONS_KEY]: actions });
}

export function onActionsChanged(listener: (actions: Action[]) => void): () => void {
  const handler = (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => {
    if (areaName === "sync" && changes[ACTIONS_KEY]) {
      listener((changes[ACTIONS_KEY].newValue as Action[] | undefined) ?? []);
    }
  };
  chrome.storage.onChanged.addListener(handler);
  return () => chrome.storage.onChanged.removeListener(handler);
}
