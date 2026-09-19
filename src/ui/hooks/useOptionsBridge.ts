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

  useEffect(() => {
    const port = chrome.runtime.connect({ name: UI_PORT_NAME });
    portRef.current = port;
    const listener = (raw: unknown) => {
      if (!isEnvelope(raw)) return;
      const envelope = raw as AnyEnvelope;
      if (envelope.type === "actions.state") {
        setState((prev) => ({ ...prev, actions: envelope.payload }));
      } else if (envelope.type === "settings.state") {
        setState((prev) => ({
          ...prev,
          config: envelope.payload.config,
          hasApiKey: envelope.payload.hasApiKey,
        }));
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
    }),
    [state],
  );
}

export type OptionsBridgeApi = ReturnType<typeof useOptionsBridge>;
