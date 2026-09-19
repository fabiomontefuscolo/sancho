import type { Action } from "../types";
import { listActions, saveActions } from "../storage/settings";

export interface ActionDraft {
  name: string;
  prompt: string;
}

export function validateActionDraft(
  draft: ActionDraft,
  existing: Action[],
  excludeId?: string,
): string | null {
  const name = draft.name.trim();
  if (name.length === 0) return "name is required";
  if (name.length > 50) return "name must be at most 50 characters";
  const duplicate = existing.some(
    (action) => action.id !== excludeId && action.name.toLowerCase() === name.toLowerCase(),
  );
  if (duplicate) return "name must be unique";
  if (draft.prompt.trim().length === 0) return "prompt is required";
  return null;
}

export async function upsertAction(action: Action): Promise<{ ok: boolean; error?: string }> {
  const actions = await listActions();
  const error = validateActionDraft(action, actions, action.id);
  if (error) return { ok: false, error };

  const index = actions.findIndex((candidate) => candidate.id === action.id);
  const next = [...actions];
  if (index >= 0) {
    next[index] = { ...action, builtin: actions[index]?.builtin ?? action.builtin };
  } else {
    next.push(action);
  }
  await saveActions(next);
  return { ok: true };
}

export async function deleteAction(actionId: string): Promise<{ ok: boolean; error?: string }> {
  const actions = await listActions();
  const action = actions.find((candidate) => candidate.id === actionId);
  if (!action) return { ok: false, error: "action not found" };
  if (action.builtin)
    return { ok: false, error: "built-in actions can be disabled but not deleted" };
  await saveActions(actions.filter((candidate) => candidate.id !== actionId));
  return { ok: true };
}
