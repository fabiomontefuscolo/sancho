import type { Action, FontSize, ProviderConfig, UiPrefs } from "../types";

const PROVIDER_KEY = "providerConfig";
const ACTIONS_KEY = "actions";

export const DEFAULT_PROVIDER_IDS = ["openai", "kimi", "deepseek", "openrouter", "custom"] as const;

export const COPILOT_PROVIDER_ID = "copilot";
export const COPILOT_BASE_URL = "https://api.githubcopilot.com";

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

const UI_PREFS_KEY = "uiPrefs";
const FONT_SIZES: readonly FontSize[] = ["small", "medium", "large"];

export const DEFAULT_UI_PREFS: UiPrefs = { fontSize: "medium" };

function normalizeUiPrefs(raw: unknown): UiPrefs {
  const candidate = (raw as Partial<UiPrefs> | undefined)?.fontSize;
  return { fontSize: candidate && FONT_SIZES.includes(candidate) ? candidate : "medium" };
}

export async function getUiPrefs(): Promise<UiPrefs> {
  const result = await chrome.storage.sync.get(UI_PREFS_KEY);
  return normalizeUiPrefs(result[UI_PREFS_KEY]);
}

export async function saveUiPrefs(prefs: UiPrefs): Promise<void> {
  await chrome.storage.sync.set({ [UI_PREFS_KEY]: prefs });
}

export function onUiPrefsChanged(listener: (prefs: UiPrefs) => void): () => void {
  const handler = (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => {
    if (areaName === "sync" && changes[UI_PREFS_KEY]) {
      listener(normalizeUiPrefs(changes[UI_PREFS_KEY].newValue));
    }
  };
  chrome.storage.onChanged.addListener(handler);
  return () => chrome.storage.onChanged.removeListener(handler);
}
