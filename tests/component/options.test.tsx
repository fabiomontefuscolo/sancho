import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SettingsPanel, type SettingsBridge } from "../../src/ui/components/settings-panel";
import type { CopilotAuthStatePayload, CopilotModelsPayload } from "../../src/bridge/messages";
import type { ProviderConfig } from "../../src/types";

const savedConfig: ProviderConfig = {
  method: "api",
  providerId: "kimi",
  baseUrl: "https://api.moonshot.ai/v1",
  model: "kimi-k2",
  apiKeyRef: "kimi",
};

function makeBridge(
  config: ProviderConfig | null = null,
  hasApiKey = false,
  copilotAuth: CopilotAuthStatePayload = { status: "disconnected" },
  copilotModels: CopilotModelsPayload = { models: [] },
) {
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
    copilotAuth,
    copilotModels,
    copilotAuthStart: vi.fn(),
    copilotAuthStatus: vi.fn(),
    copilotAuthDisconnect: vi.fn(),
    copilotModelsList: vi.fn(),
  };
  return bridge;
}

describe("SettingsPanel", () => {
  it("shows only API fields when the api method is selected", async () => {
    render(<SettingsPanel bridge={makeBridge()} />);
    await userEvent.click(screen.getByRole("radio", { name: /api key/i }));
    expect(screen.getByLabelText(/^provider$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^api key$/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/native host/i)).not.toBeInTheDocument();
  });

  it("shows only ACP fields when the local agent method is selected", async () => {
    render(<SettingsPanel bridge={makeBridge()} />);
    await userEvent.click(screen.getByRole("radio", { name: /local agent/i }));
    expect(screen.getByLabelText(/native host/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/^provider$/i)).not.toBeInTheDocument();
  });

  it("restores saved values on load", () => {
    render(<SettingsPanel bridge={makeBridge(savedConfig, true)} />);
    expect(screen.getByLabelText(/^provider$/i)).toHaveValue("kimi");
    expect(screen.getByLabelText(/model/i)).toHaveValue("kimi-k2");
    expect(screen.getByLabelText(/endpoint/i)).toHaveValue("https://api.moonshot.ai/v1");
  });

  it("saves the configuration including the api key", async () => {
    const bridge = makeBridge();
    render(<SettingsPanel bridge={bridge} />);
    await userEvent.click(screen.getByRole("radio", { name: /api key/i }));
    await userEvent.selectOptions(screen.getByLabelText(/^provider$/i), "deepseek");
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
    await userEvent.selectOptions(screen.getByLabelText(/^provider$/i), "openrouter");
    expect(screen.getByLabelText(/endpoint/i)).toHaveValue("https://openrouter.ai/api/v1");
  });

  it("shows the connect button and disclaimer for the copilot method", async () => {
    render(<SettingsPanel bridge={makeBridge()} />);
    await userEvent.click(screen.getByRole("radio", { name: /github copilot/i }));
    expect(screen.getByRole("button", { name: /connect with github/i })).toBeInTheDocument();
    expect(screen.getByText(/undocumented/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/^provider$/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/native host/i)).not.toBeInTheDocument();
  });

  it("starts the device flow when connect is clicked", async () => {
    const bridge = makeBridge();
    render(<SettingsPanel bridge={bridge} />);
    await userEvent.click(screen.getByRole("radio", { name: /github copilot/i }));
    await userEvent.click(screen.getByRole("button", { name: /connect with github/i }));
    expect(bridge.copilotAuthStart).toHaveBeenCalled();
  });

  it("shows the verification code while the flow is pending", async () => {
    window.open = vi.fn();
    render(
      <SettingsPanel
        bridge={makeBridge(null, false, {
          status: "pending",
          userCode: "ABCD-EFGH",
          verificationUri: "https://github.com/login/device",
        })}
      />,
    );
    await userEvent.click(screen.getByRole("radio", { name: /github copilot/i }));
    expect(screen.getByText("ABCD-EFGH")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /github\.com\/login\/device/i })).toBeInTheDocument();
  });

  it("shows the model dropdown and disconnect when connected", async () => {
    render(
      <SettingsPanel
        bridge={makeBridge(
          null,
          false,
          { status: "connected" },
          { models: ["gpt-4.1", "claude-sonnet-4"] },
        )}
      />,
    );
    await userEvent.click(screen.getByRole("radio", { name: /github copilot/i }));
    expect(screen.getByText(/connected to github/i)).toBeInTheDocument();
    expect(screen.getByText(/undocumented/i)).toBeInTheDocument();
    const select = screen.getByLabelText(/model/i);
    await userEvent.selectOptions(select, "gpt-4.1");
    expect(select).toHaveValue("gpt-4.1");
  });

  it("falls back to a free-text model input when the model list is unavailable", async () => {
    render(
      <SettingsPanel
        bridge={makeBridge(null, false, { status: "connected" }, { models: [], error: "boom" })}
      />,
    );
    await userEvent.click(screen.getByRole("radio", { name: /github copilot/i }));
    const input = screen.getByLabelText(/model/i);
    expect(input.tagName).toBe("INPUT");
    await userEvent.type(input, "gpt-4.1");
    expect(input).toHaveValue("gpt-4.1");
  });

  it("preselects the saved copilot model and saves the copilot config", async () => {
    const copilotConfig: ProviderConfig = {
      method: "copilot",
      providerId: "copilot",
      baseUrl: "https://api.githubcopilot.com",
      model: "claude-sonnet-4",
      apiKeyRef: "copilot",
    };
    const bridge = makeBridge(
      copilotConfig,
      false,
      { status: "connected" },
      { models: ["gpt-4.1", "claude-sonnet-4"] },
    );
    render(<SettingsPanel bridge={bridge} />);
    expect(screen.getByLabelText(/model/i)).toHaveValue("claude-sonnet-4");
    await userEvent.click(screen.getByRole("button", { name: /save/i }));
    await waitFor(() =>
      expect(bridge.saveSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          method: "copilot",
          providerId: "copilot",
          baseUrl: "https://api.githubcopilot.com",
          model: "claude-sonnet-4",
        }),
        undefined,
      ),
    );
  });

  it("disconnects via the bridge", async () => {
    const bridge = makeBridge(null, false, { status: "connected" }, { models: ["gpt-4.1"] });
    render(<SettingsPanel bridge={bridge} />);
    await userEvent.click(screen.getByRole("radio", { name: /github copilot/i }));
    await userEvent.click(screen.getByRole("button", { name: /disconnect/i }));
    expect(bridge.copilotAuthDisconnect).toHaveBeenCalled();
  });
});

describe("Appearance placement", () => {
  it("does not render appearance settings inside the connection section", async () => {
    render(<SettingsPanel bridge={makeBridge()} />);
    expect(screen.queryByRole("heading", { name: /appearance/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: /font size/i })).not.toBeInTheDocument();
  });
});

vi.mock("../../src/ui/hooks/useOptionsBridge", () => ({
  useOptionsBridge: () => ({
    actions: [],
    config: null,
    hasApiKey: false,
    error: null,
    copilotAuth: { status: "disconnected" },
    copilotModels: { models: [] },
    upsertAction: vi.fn(),
    deleteAction: vi.fn(),
    saveSettings: vi.fn(),
    clearError: vi.fn(),
    copilotAuthStart: vi.fn(),
    copilotAuthStatus: vi.fn(),
    copilotAuthDisconnect: vi.fn(),
    copilotModelsList: vi.fn(),
    subscribeActions: (listener: (actions: never[]) => void) => {
      listener([]);
      return () => {};
    },
    subscribeSettings: (listener: (state: { config: null; hasApiKey: boolean }) => void) => {
      listener({ config: null, hasApiKey: false });
      return () => {};
    },
  }),
}));

import { OptionsPage } from "../../entrypoints/options/main";

function installOptionsStorageMock() {
  const storage = {
    sync: { get: vi.fn(async () => ({})), set: vi.fn(async () => {}) },
    local: { get: vi.fn(async () => ({})), set: vi.fn(async () => {}) },
    onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
  };
  vi.stubGlobal("chrome", { storage });
}

describe("OptionsPage navigation", () => {
  it("links to a Custom instructions section between Appearance and Actions", async () => {
    installOptionsStorageMock();
    render(<OptionsPage />);
    const nav = document.querySelector(".options-nav");
    if (!nav) throw new Error("missing nav");
    const hrefs = Array.from(nav.querySelectorAll("a")).map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual(["#connection", "#appearance", "#instructions", "#actions", "#about"]);
    expect(document.getElementById("instructions")).not.toBeNull();
    expect(
      await screen.findByRole("heading", { name: /custom instructions/i }),
    ).toBeInTheDocument();
  });
});
