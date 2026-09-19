import type { BaseLLMProvider } from "../providers/base";
import type { Action } from "../types";

export interface ActionDeps {
  provider: BaseLLMProvider;
  getSelection: (tabId: number) => Promise<{ text: string; editable: boolean }>;
  replaceSelection: (
    tabId: number,
    replacement: string,
  ) => Promise<{ ok: boolean; error?: string }>;
  appendToConversation: (text: string) => Promise<void>;
}

export interface ActionOutcome {
  ok: boolean;
  replacement?: string;
  text?: string;
  error?: string;
}

const busyTabs = new Set<number>();

export async function runSelectionAction(
  action: Action,
  tabId: number,
  deps: ActionDeps,
): Promise<ActionOutcome> {
  if (busyTabs.has(tabId)) {
    return { ok: false, error: "an action is already running on this tab" };
  }
  busyTabs.add(tabId);
  try {
    const selection = await deps.getSelection(tabId);
    if (!selection.text) return { ok: false, error: "no text selected" };

    const prompt = action.prompt.replaceAll("{{selection}}", selection.text);
    let resultText = "";
    let failure: Error | null = null;
    await deps.provider.streamChat([{ role: "user", content: prompt }], [] as never[], {
      onDelta: (text) => {
        resultText += text;
      },
      onToolCall: () => {},
      onDone: () => {},
      onError: (error) => {
        failure = error;
      },
    });
    if (failure) return { ok: false, error: (failure as Error).message };

    if (selection.editable) {
      const replaced = await deps.replaceSelection(tabId, resultText);
      if (!replaced.ok) return { ok: false, error: replaced.error ?? "replace failed" };
      return { ok: true, replacement: resultText };
    }

    await deps.appendToConversation(resultText);
    return { ok: true, text: resultText };
  } finally {
    busyTabs.delete(tabId);
  }
}
