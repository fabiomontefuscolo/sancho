import { useEffect, useMemo, useRef, useState } from "react";
import { UI_PORT_NAME, isEnvelope, makeEnvelope, type AnyEnvelope } from "../../bridge/messages";
import type { Action, ProviderConfig } from "../../types";

export interface OptionsState {
  actions: Action[];
  config: ProviderConfig | null;
  hasApiKey: boolean;
  error: string | null;
}

export function useOptionsBridge() {
  const [state, setState] = useState<OptionsState>({
    actions: [],
    config: null,
    hasApiKey: false,
    error: null,
  });
  const portRef = useRef<chrome.runtime.Port | null>(null);
  const actionListeners = useRef(new Set<(actions: Action[]) => void>());
  const settingsListeners = useRef(
    new Set<(state: { config: ProviderConfig | null; hasApiKey: boolean }) => void>(),
  );

  useEffect(() => {
    const port = chrome.runtime.connect({ name: UI_PORT_NAME });
    portRef.current = port;
    const listener = (raw: unknown) => {
      if (!isEnvelope(raw)) return;
      const envelope = raw as AnyEnvelope;
      if (envelope.type === "actions.state") {
        setState((prev) => ({ ...prev, actions: envelope.payload }));
        actionListeners.current.forEach((fn) => fn(envelope.payload));
      } else if (envelope.type === "settings.state") {
        setState((prev) => ({
          ...prev,
          config: envelope.payload.config,
          hasApiKey: envelope.payload.hasApiKey,
        }));
        settingsListeners.current.forEach((fn) => fn(envelope.payload));
      } else if (envelope.type === "chat.error") {
        setState((prev) => ({ ...prev, error: envelope.payload.message }));
      }
    };
    port.onMessage.addListener(listener);
    port.postMessage(makeEnvelope("request", "actions.list", {}));
    port.postMessage(makeEnvelope("request", "settings.get", {}));
    return () => port.disconnect();
  }, []);

  return useMemo(
    () => ({
      ...state,
      upsertAction: (action: Action) =>
        portRef.current?.postMessage(makeEnvelope("request", "actions.upsert", { action })),
      deleteAction: (actionId: string) =>
        portRef.current?.postMessage(makeEnvelope("request", "actions.delete", { actionId })),
      saveSettings: (config: ProviderConfig, apiKey?: string) =>
        portRef.current?.postMessage(
          makeEnvelope("request", "settings.set", {
            config,
            ...(apiKey !== undefined ? { apiKey } : {}),
          }),
        ),
      clearError: () => setState((prev) => ({ ...prev, error: null })),
      subscribeActions: (listener: (actions: Action[]) => void) => {
        actionListeners.current.add(listener);
        listener(state.actions);
        return () => actionListeners.current.delete(listener);
      },
      subscribeSettings: (
        listener: (s: { config: ProviderConfig | null; hasApiKey: boolean }) => void,
      ) => {
        settingsListeners.current.add(listener);
        listener({ config: state.config, hasApiKey: state.hasApiKey });
        return () => settingsListeners.current.delete(listener);
      },
    }),
    [state],
  );
}

export type OptionsBridgeApi = ReturnType<typeof useOptionsBridge>;
