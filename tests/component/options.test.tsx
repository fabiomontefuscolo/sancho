import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SettingsPanel, type SettingsBridge } from "../../src/ui/components/settings-panel";
import type { ProviderConfig } from "../../src/types";

const savedConfig: ProviderConfig = {
  method: "api",
  providerId: "kimi",
  baseUrl: "https://api.moonshot.ai/v1",
  model: "kimi-k2",
  apiKeyRef: "kimi",
};

function makeBridge(config: ProviderConfig | null = null, hasApiKey = false) {
  const listeners: Array<(state: { config: ProviderConfig | null; hasApiKey: boolean }) => void> =
    [];
  const bridge: SettingsBridge = {
    requestSettings: vi.fn(),
    saveSettings: vi.fn(),
    onSettings: (listener) => {
      listeners.push(listener);
      listener({ config, hasApiKey });
      return () => {};
    },
  };
  return bridge;
}

describe("SettingsPanel", () => {
  it("shows only API fields when the api method is selected", async () => {
    render(<SettingsPanel bridge={makeBridge()} />);
    await userEvent.click(screen.getByRole("radio", { name: /api key/i }));
    expect(screen.getByLabelText(/provider/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/api key/i, { selector: "input" })).toBeInTheDocument();
    expect(screen.queryByLabelText(/native host/i)).not.toBeInTheDocument();
  });

  it("shows only ACP fields when the local agent method is selected", async () => {
    render(<SettingsPanel bridge={makeBridge()} />);
    await userEvent.click(screen.getByRole("radio", { name: /local agent/i }));
    expect(screen.getByLabelText(/native host/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/provider/i)).not.toBeInTheDocument();
  });

  it("restores saved values on load", () => {
    render(<SettingsPanel bridge={makeBridge(savedConfig, true)} />);
    expect(screen.getByLabelText(/provider/i)).toHaveValue("kimi");
    expect(screen.getByLabelText(/model/i)).toHaveValue("kimi-k2");
    expect(screen.getByLabelText(/endpoint/i)).toHaveValue("https://api.moonshot.ai/v1");
  });

  it("saves the configuration including the api key", async () => {
    const bridge = makeBridge();
    render(<SettingsPanel bridge={bridge} />);
    await userEvent.click(screen.getByRole("radio", { name: /api key/i }));
    await userEvent.selectOptions(screen.getByLabelText(/provider/i), "deepseek");
    await userEvent.type(screen.getByLabelText(/model/i), "deepseek-chat");
    await userEvent.type(screen.getByLabelText(/^api key$/i), "sk-test");
    await userEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() =>
      expect(bridge.saveSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          method: "api",
          providerId: "deepseek",
          baseUrl: "https://api.deepseek.com/v1",
          model: "deepseek-chat",
        }),
        "sk-test",
      ),
    );
  });

  it("prefills the default endpoint when switching providers", async () => {
    render(<SettingsPanel bridge={makeBridge()} />);
    await userEvent.click(screen.getByRole("radio", { name: /api key/i }));
    await userEvent.selectOptions(screen.getByLabelText(/provider/i), "openrouter");
    expect(screen.getByLabelText(/endpoint/i)).toHaveValue("https://openrouter.ai/api/v1");
  });
});
