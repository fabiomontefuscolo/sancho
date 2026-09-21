import { describe, expect, it, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppearanceSection } from "../../src/ui/components/appearance-section";

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

describe("AppearanceSection", () => {
  beforeEach(() => {
    installMockSyncStorage();
  });

  it("shows the message font size select", async () => {
    render(<AppearanceSection />);
    expect(await screen.findByRole("combobox", { name: /message font size/i })).toBeInTheDocument();
  });

  it("persists font size changes", async () => {
    const { storage } = installMockSyncStorage();
    render(<AppearanceSection />);
    const select = await screen.findByRole("combobox", { name: /message font size/i });
    await userEvent.selectOptions(select, "large");
    await waitFor(() => {
      expect(storage.sync.set).toHaveBeenCalledWith({ uiPrefs: { fontSize: "large" } });
    });
  });

  it("reflects the stored font size", async () => {
    installMockSyncStorage({ uiPrefs: { fontSize: "small" } });
    render(<AppearanceSection />);
    const select = await screen.findByRole("combobox", { name: /message font size/i });
    await waitFor(() => expect(select).toHaveValue("small"));
  });
});
