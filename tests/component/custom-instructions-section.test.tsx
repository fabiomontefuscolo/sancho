import { describe, expect, it, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CustomInstructionsSection } from "../../src/ui/components/custom-instructions-section";
import { MAX_CUSTOM_INSTRUCTIONS } from "../../src/storage/settings";

type ChangeListener = (changes: Record<string, { newValue?: unknown }>, areaName: string) => void;

function installMockSyncStorage(initial: Record<string, unknown> = {}) {
  const data = { ...initial };
  const listeners: ChangeListener[] = [];
  const storage = {
    sync: {
      get: vi.fn(async (key: string) => ({ [key]: data[key] })),
      set: vi.fn(async (items: Record<string, unknown>) => {
        Object.assign(data, items);
        const changes = Object.fromEntries(
          Object.entries(items).map(([k, v]) => [k, { newValue: v }]),
        );
        for (const listener of listeners) listener(changes, "sync");
      }),
    },
    onChanged: {
      addListener: (listener: ChangeListener) => listeners.push(listener),
      removeListener: (listener: ChangeListener) => {
        const index = listeners.indexOf(listener);
        if (index >= 0) listeners.splice(index, 1);
      },
    },
    local: { get: vi.fn(async () => ({})), set: vi.fn(async () => {}) },
  };
  vi.stubGlobal("chrome", { storage });
  return { data, storage };
}

describe("CustomInstructionsSection", () => {
  beforeEach(() => {
    installMockSyncStorage();
  });

  it("renders heading, AGENTS.md hint, textarea and counter", async () => {
    render(<CustomInstructionsSection />);
    expect(
      await screen.findByRole("heading", { name: /custom instructions/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/AGENTS\.md/)).toBeInTheDocument();
    const textarea = screen.getByRole("textbox", { name: /custom instructions/i });
    expect(textarea).toHaveAttribute("maxLength", String(MAX_CUSTOM_INSTRUCTIONS));
    expect(screen.getByText(`0 / ${MAX_CUSTOM_INSTRUCTIONS}`)).toBeInTheDocument();
  });

  it("updates the counter and persists while typing", async () => {
    const { data } = installMockSyncStorage();
    render(<CustomInstructionsSection />);
    const textarea = await screen.findByRole("textbox", { name: /custom instructions/i });
    await userEvent.type(textarea, "be terse");
    expect(screen.getByText(`8 / ${MAX_CUSTOM_INSTRUCTIONS}`)).toBeInTheDocument();
    await waitFor(() => expect(data.customInstructions).toBe("be terse"), { timeout: 2000 });
  });

  it("reflects stored instructions on load", async () => {
    installMockSyncStorage({ customInstructions: "reply in Portuguese" });
    render(<CustomInstructionsSection />);
    const textarea = await screen.findByRole("textbox", { name: /custom instructions/i });
    await waitFor(() => expect(textarea).toHaveValue("reply in Portuguese"));
    expect(screen.getByText(`19 / ${MAX_CUSTOM_INSTRUCTIONS}`)).toBeInTheDocument();
  });
});
