import { useEffect, useState } from "react";
import type { Action } from "../../types";

export interface OptionsBridge {
  requestActions(): void;
  upsertAction(action: Action): void;
  deleteAction(actionId: string): void;
  onActions(listener: (actions: Action[]) => void): () => void;
}

interface Draft {
  id: string | null;
  name: string;
  prompt: string;
}

const EMPTY_DRAFT: Draft = { id: null, name: "", prompt: "" };

export function ActionManager({ bridge }: { bridge: OptionsBridge }) {
  const [actions, setActions] = useState<Action[]>([]);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);

  useEffect(() => {
    bridge.requestActions();
    return bridge.onActions(setActions);
  }, [bridge]);

  const submit = () => {
    const action: Action = {
      id: draft.id ?? crypto.randomUUID(),
      name: draft.name.trim(),
      prompt: draft.prompt,
      builtin: false,
      enabled: true,
    };
    if (draft.id) {
      const existing = actions.find((candidate) => candidate.id === draft.id);
      if (existing) {
        action.builtin = existing.builtin;
        action.enabled = existing.enabled;
      }
    }
    bridge.upsertAction(action);
    setDraft(EMPTY_DRAFT);
  };

  return (
    <section aria-label="Actions" className="options-section">
      <h2>Actions</h2>
      <ul className="action-list">
        {actions.map((action) => (
          <li key={action.id} className="action-row">
            <input
              type="checkbox"
              aria-label={`Enable ${action.name}`}
              checked={action.enabled}
              onChange={() => bridge.upsertAction({ ...action, enabled: !action.enabled })}
            />
            <span className="action-name">{action.name}</span>
            {action.builtin && <span className="action-badge">built-in</span>}
            <button
              aria-label={`Edit ${action.name}`}
              onClick={() => setDraft({ id: action.id, name: action.name, prompt: action.prompt })}
            >
              Edit
            </button>
            {!action.builtin && (
              <button
                aria-label={`Delete ${action.name}`}
                onClick={() => bridge.deleteAction(action.id)}
              >
                Delete
              </button>
            )}
          </li>
        ))}
      </ul>
      <div className="action-form">
        <label>
          Action name
          <input
            value={draft.name}
            onChange={(event) => setDraft({ ...draft, name: event.target.value })}
          />
        </label>
        <label>
          Prompt (use {"{{selection}}"} for the selected text)
          <textarea
            value={draft.prompt}
            rows={3}
            onChange={(event) => setDraft({ ...draft, prompt: event.target.value })}
          />
        </label>
        <button onClick={submit} disabled={!draft.name.trim() || !draft.prompt.trim()}>
          {draft.id ? "Save action" : "Add action"}
        </button>
        {draft.id && <button onClick={() => setDraft(EMPTY_DRAFT)}>Cancel</button>}
      </div>
    </section>
  );
}
