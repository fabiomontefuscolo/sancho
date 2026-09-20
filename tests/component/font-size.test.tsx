import { describe, expect, it, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { act } from "react";
import { ChatPanel } from "../../src/ui/components/chat";
import { installMockPort } from "./helpers/mock-port";
import { getUiPrefs, DEFAULT_UI_PREFS } from "../../src/storage/settings";

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
  Object.assign(chrome as unknown as Record<string, unknown>, { storage });
  return { data, storage };
}

describe("font-size preference", () => {
  beforeEach(() => {
    installMockPort();
    installMockSyncStorage();
  });

  it("defaults to medium when unset or unknown", async () => {
    expect(await getUiPrefs()).toEqual(DEFAULT_UI_PREFS);
    expect(DEFAULT_UI_PREFS.fontSize).toBe("medium");

    await chrome.storage.sync.set({ uiPrefs: { fontSize: "gigantic" } });
    expect((await getUiPrefs()).fontSize).toBe("medium");
  });

  it("applies the stored size class to the chat root", async () => {
    await chrome.storage.sync.set({ uiPrefs: { fontSize: "large" } });
    render(<ChatPanel tabId={7} />);

    await waitFor(() => {
      expect(document.querySelector(".sancho-chat-root")?.className).toContain("sancho-font-large");
    });
  });

  it("reacts to storage changes from another surface", async () => {
    render(<ChatPanel tabId={7} />);
    await waitFor(() => {
      expect(document.querySelector(".sancho-chat-root")?.className).toContain(
        "sancho-font-medium",
      );
    });

    await act(async () => {
      await chrome.storage.sync.set({ uiPrefs: { fontSize: "small" } });
    });

    await waitFor(() => {
      expect(document.querySelector(".sancho-chat-root")?.className).toContain("sancho-font-small");
    });
  });

  it("persists the choice from the sidebar settings view", async () => {
    render(<ChatPanel tabId={7} />);
    await userEvent.click(screen.getByRole("button", { name: /settings/i }));

    const select = await screen.findByRole("combobox", { name: /font size/i });
    await userEvent.selectOptions(select, "large");

    await waitFor(() => {
      expect(chrome.storage.sync.set).toHaveBeenCalledWith({
        uiPrefs: { fontSize: "large" },
      });
    });
    expect(document.querySelector(".sancho-chat-root")?.className).toContain("sancho-font-large");
  });
});
