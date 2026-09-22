import { StrictMode, useMemo } from "react";
import { createRoot } from "react-dom/client";
import { AboutSection } from "../../src/ui/components/about-section";
import { ActionManager, type OptionsBridge } from "../../src/ui/components/action-manager";
import { AppearanceSection } from "../../src/ui/components/appearance-section";
import { CustomInstructionsSection } from "../../src/ui/components/custom-instructions-section";
import { SettingsPanel, type SettingsBridge } from "../../src/ui/components/settings-panel";
import { useOptionsBridge } from "../../src/ui/hooks/useOptionsBridge";
import type { Action } from "../../src/types";
import type { ProviderConfig } from "../../src/types";
import "./options.css";

export function OptionsPage() {
  const bridge = useOptionsBridge();

  const actionBridge = useMemo<OptionsBridge>(
    () => ({
      requestActions: () => {},
      upsertAction: (action: Action) => bridge.upsertAction(action),
      deleteAction: (actionId: string) => bridge.deleteAction(actionId),
      onActions: (listener) => bridge.subscribeActions(listener),
    }),
    [bridge],
  );

  const settingsBridge = useMemo<SettingsBridge>(
    () => ({
      requestSettings: () => {},
      saveSettings: (config: ProviderConfig, apiKey?: string) =>
        bridge.saveSettings(config, apiKey),
      onSettings: (listener) => bridge.subscribeSettings(listener),
      copilotAuth: bridge.copilotAuth,
      copilotModels: bridge.copilotModels,
      copilotAuthStart: () => bridge.copilotAuthStart(),
      copilotAuthStatus: () => bridge.copilotAuthStatus(),
      copilotAuthDisconnect: () => bridge.copilotAuthDisconnect(),
      copilotModelsList: () => bridge.copilotModelsList(),
    }),
    [bridge],
  );

  return (
    <div className="options-layout">
      <nav className="options-nav">
        <h1>Sancho</h1>
        <a href="#connection">Connection</a>
        <a href="#appearance">Appearance</a>
        <a href="#instructions">Custom instructions</a>
        <a href="#actions">Actions</a>
        <a href="#about">About</a>
      </nav>
      <main className="options-main">
        {bridge.error && (
          <div className="options-error" role="alert">
            {bridge.error}
            <button onClick={bridge.clearError}>Dismiss</button>
          </div>
        )}
        <div id="connection">
          <SettingsPanel bridge={settingsBridge} />
        </div>
        <div id="appearance">
          <AppearanceSection />
        </div>
        <div id="instructions">
          <CustomInstructionsSection />
        </div>
        <div id="actions">
          <ActionManager bridge={actionBridge} />
        </div>
        <div id="about">
          <AboutSection />
        </div>
      </main>
    </div>
  );
}

const rootElement = document.getElementById("root");
if (rootElement) {
  createRoot(rootElement).render(
    <StrictMode>
      <OptionsPage />
    </StrictMode>,
  );
}
