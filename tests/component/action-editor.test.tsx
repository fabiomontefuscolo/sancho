import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ActionManager, type OptionsBridge } from "../../src/ui/components/action-manager";
import type { Action } from "../../src/types";

function makeBridge(initial: Action[] = []) {
  let actions = [...initial];
  const listeners: Array<(actions: Action[]) => void> = [];
  const bridge: OptionsBridge = {
    requestActions: vi.fn(),
    upsertAction: vi.fn((action: Action) => {
      const index = actions.findIndex((candidate) => candidate.id === action.id);
      if (index >= 0) actions[index] = action;
      else actions.push(action);
      listeners.forEach((listener) => listener([...actions]));
    }),
    deleteAction: vi.fn((id: string) => {
      actions = actions.filter((candidate) => candidate.id !== id);
      listeners.forEach((listener) => listener([...actions]));
    }),
    onActions: (listener) => {
      listeners.push(listener);
      listener([...actions]);
      return () => {};
    },
  };
  return bridge;
}

describe("ActionManager", () => {
  it("lists actions and creates a new custom action", async () => {
    const bridge = makeBridge([
      { id: "fix-grammar", name: "Fix grammar", prompt: "p", builtin: true, enabled: true },
    ]);
    render(<ActionManager bridge={bridge} />);

    expect(screen.getByText("Fix grammar")).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText(/action name/i), "Translate to Spanish");
    await userEvent.type(screen.getByLabelText(/prompt/i), "Translate: {{selection}}");
    await userEvent.click(screen.getByRole("button", { name: /add action/i }));

    expect(bridge.upsertAction).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Translate to Spanish",
        prompt: "Translate: {{selection}}",
        builtin: false,
        enabled: true,
      }),
    );
    await waitFor(() => expect(screen.getByText("Translate to Spanish")).toBeInTheDocument());
  });

  it("deletes a custom action", async () => {
    const bridge = makeBridge([
      { id: "c1", name: "My action", prompt: "p", builtin: false, enabled: true },
    ]);
    render(<ActionManager bridge={bridge} />);

    await userEvent.click(screen.getByRole("button", { name: /delete my action/i }));
    expect(bridge.deleteAction).toHaveBeenCalledWith("c1");
    await waitFor(() => expect(screen.queryByText("My action")).not.toBeInTheDocument());
  });

  it("edits an existing action through the form", async () => {
    const bridge = makeBridge([
      { id: "c1", name: "My action", prompt: "old prompt", builtin: false, enabled: true },
    ]);
    render(<ActionManager bridge={bridge} />);

    await userEvent.click(screen.getByRole("button", { name: /edit my action/i }));
    const nameInput = screen.getByLabelText(/action name/i);
    expect(nameInput).toHaveValue("My action");
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, "Renamed");
    await userEvent.click(screen.getByRole("button", { name: /save action/i }));

    expect(bridge.upsertAction).toHaveBeenCalledWith(
      expect.objectContaining({ id: "c1", name: "Renamed", prompt: "old prompt" }),
    );
  });

  it("toggles an action's enabled state", async () => {
    const bridge = makeBridge([
      { id: "fix-grammar", name: "Fix grammar", prompt: "p", builtin: true, enabled: true },
    ]);
    render(<ActionManager bridge={bridge} />);

    await userEvent.click(screen.getByRole("checkbox", { name: /enable fix grammar/i }));
    expect(bridge.upsertAction).toHaveBeenCalledWith(
      expect.objectContaining({ id: "fix-grammar", enabled: false }),
    );
  });
});
