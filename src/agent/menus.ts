import type { Action } from "../types";
import { listActions, onActionsChanged, saveActions } from "../storage/settings";

export const BUILTIN_ACTIONS: Action[] = [
  {
    id: "improve-writing",
    name: "Improve writing",
    prompt:
      "Improve the writing of the following text. Return only the improved text, no explanations.\n\n{{selection}}",
    builtin: true,
    enabled: true,
  },
  {
    id: "make-formal",
    name: "Make it formal",
    prompt:
      "Rewrite the following text in a formal tone. Return only the rewritten text, no explanations.\n\n{{selection}}",
    builtin: true,
    enabled: true,
  },
  {
    id: "fix-grammar",
    name: "Fix grammar",
    prompt:
      "Fix the grammar of the following text. Return only the corrected text, no explanations.\n\n{{selection}}",
    builtin: true,
    enabled: true,
  },
];

export async function seedBuiltinActions(): Promise<void> {
  const existing = await listActions();
  if (existing.length > 0) return;
  await saveActions(BUILTIN_ACTIONS);
}

export function menuIdForAction(actionId: string): string {
  return `sancho-action:${actionId}`;
}

export async function rebuildContextMenus(): Promise<void> {
  const actions = await listActions();
  await chrome.contextMenus.removeAll();
  for (const action of actions.filter((candidate) => candidate.enabled)) {
    chrome.contextMenus.create({
      id: menuIdForAction(action.id),
      title: action.name,
      contexts: ["selection"],
    });
  }
}

export function watchActionChanges(): void {
  onActionsChanged(() => {
    void rebuildContextMenus();
  });
}
