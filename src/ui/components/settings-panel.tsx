import { useEffect, useRef, useState } from "react";
import type { ConnectionMethod, ProviderConfig } from "../../types";
import type { CopilotAuthStatePayload, CopilotModelsPayload } from "../../bridge/messages";
import {
  COPILOT_BASE_URL,
  COPILOT_PROVIDER_ID,
  DEFAULT_BASE_URLS,
  DEFAULT_PROVIDER_IDS,
} from "../../storage/settings";

export interface SettingsBridge {
  requestSettings(): void;
  saveSettings(config: ProviderConfig, apiKey?: string): void;
  onSettings(
    listener: (state: { config: ProviderConfig | null; hasApiKey: boolean }) => void,
  ): () => void;
  copilotAuth: CopilotAuthStatePayload;
  copilotModels: CopilotModelsPayload;
  copilotAuthStart(): void;
  copilotAuthStatus(): void;
  copilotAuthDisconnect(): void;
  copilotModelsList(): void;
}

export function SettingsPanel({ bridge }: { bridge: SettingsBridge }) {
  const [method, setMethod] = useState<ConnectionMethod>("api");
  const [providerId, setProviderId] = useState<string>("openai");
  const [baseUrl, setBaseUrl] = useState(DEFAULT_BASE_URLS.openai ?? "");
  const [model, setModel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [hostName, setHostName] = useState("com.sancho.acp_host");
  const [token, setToken] = useState("");
  const [saved, setSaved] = useState(false);
  const openedCodeRef = useRef<string | null>(null);
  const bridgeRef = useRef(bridge);
  bridgeRef.current = bridge;

  const copilotAuth = bridge.copilotAuth;
  const copilotModels = bridge.copilotModels;

  useEffect(() => {
    if (method === "copilot") bridgeRef.current.copilotAuthStatus();
  }, [method]);

  useEffect(() => {
    if (method === "copilot" && copilotAuth.status === "connected") {
      bridgeRef.current.copilotModelsList();
    }
  }, [method, copilotAuth.status]);

  useEffect(() => {
    if (copilotAuth.status !== "pending" || openedCodeRef.current === copilotAuth.userCode) return;
    openedCodeRef.current = copilotAuth.userCode;
    window.open(copilotAuth.verificationUri, "_blank", "noopener");
  }, [copilotAuth]);

  useEffect(() => {
    bridgeRef.current.requestSettings();
    return bridgeRef.current.onSettings(({ config }) => {
      if (!config) return;
      setMethod(config.method);
      setProviderId(config.providerId);
      setBaseUrl(config.baseUrl);
      setModel(config.model);
      if (config.acp) {
        setHostName(config.acp.hostName);
        setToken(config.acp.token ?? "");
      }
    });
  }, []);

  const selectProvider = (next: string) => {
    setProviderId(next);
    setBaseUrl(DEFAULT_BASE_URLS[next] ?? "");
  };

  const save = () => {
    const config: ProviderConfig =
      method === "api"
        ? { method, providerId, baseUrl, model, apiKeyRef: providerId }
        : method === "copilot"
          ? {
              method,
              providerId: COPILOT_PROVIDER_ID,
              baseUrl: COPILOT_BASE_URL,
              model,
              apiKeyRef: COPILOT_PROVIDER_ID,
            }
          : {
              method,
              providerId: "acp",
              baseUrl: "",
              model: "",
              apiKeyRef: "acp",
              acp: { hostName, ...(token ? { token } : {}) },
            };
    bridge.saveSettings(config, apiKey ? apiKey : undefined);
    setApiKey("");
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <section aria-label="Connection" className="options-section">
      <h2>Connection</h2>
      <fieldset className="method-picker">
        <label>
          <input
            type="radio"
            name="method"
            checked={method === "api"}
            onChange={() => setMethod("api")}
          />
          API key (cloud provider)
        </label>
        <label>
          <input
            type="radio"
            name="method"
            checked={method === "acp"}
            onChange={() => setMethod("acp")}
          />
          Local agent (ACP)
        </label>
        <label>
          <input
            type="radio"
            name="method"
            checked={method === "copilot"}
            onChange={() => setMethod("copilot")}
          />
          GitHub Copilot
        </label>
      </fieldset>

      {method === "copilot" && (
        <div className="settings-grid">
          <p className="copilot-note">
            Requires an active GitHub Copilot subscription. This integration uses an undocumented
            GitHub API — use at your own risk.
          </p>
          {copilotAuth.status === "connected" ? (
            <>
              <p className="copilot-status">Connected to GitHub</p>
              {copilotModels.models.length > 0 ? (
                <label>
                  Model
                  <select value={model} onChange={(event) => setModel(event.target.value)}>
                    {[...new Set([model, ...copilotModels.models])]
                      .filter((id) => id.length > 0)
                      .map((id) => (
                        <option key={id} value={id}>
                          {id}
                        </option>
                      ))}
                  </select>
                </label>
              ) : (
                <label>
                  Model
                  <input
                    value={model}
                    placeholder="e.g. gpt-4.1"
                    onChange={(event) => setModel(event.target.value)}
                  />
                </label>
              )}
              <button type="button" onClick={() => bridge.copilotAuthDisconnect()}>
                Disconnect
              </button>
            </>
          ) : copilotAuth.status === "pending" ? (
            <p className="copilot-status">
              Enter code <code>{copilotAuth.userCode}</code> at{" "}
              <a href={copilotAuth.verificationUri} target="_blank" rel="noreferrer">
                {copilotAuth.verificationUri.replace("https://", "")}
              </a>{" "}
              to finish connecting.
            </p>
          ) : (
            <>
              {copilotAuth.status === "error" && (
                <p className="copilot-error" role="alert">
                  {copilotAuth.message}
                </p>
              )}
              <button type="button" onClick={() => bridge.copilotAuthStart()}>
                Connect with GitHub
              </button>
            </>
          )}
        </div>
      )}

      {method === "api" ? (
        <div className="settings-grid">
          <label>
            Provider
            <select value={providerId} onChange={(event) => selectProvider(event.target.value)}>
              {DEFAULT_PROVIDER_IDS.map((id) => (
                <option key={id} value={id}>
                  {id}
                </option>
              ))}
            </select>
          </label>
          <label>
            Endpoint
            <input value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} />
          </label>
          <label>
            Model
            <input value={model} onChange={(event) => setModel(event.target.value)} />
          </label>
          <label>
            API key
            <input
              type="password"
              value={apiKey}
              placeholder="Stored locally, never synced"
              onChange={(event) => setApiKey(event.target.value)}
            />
          </label>
        </div>
      ) : null}

      {method === "acp" ? (
        <div className="settings-grid">
          <label>
            Native host name
            <input value={hostName} onChange={(event) => setHostName(event.target.value)} />
          </label>
          <label>
            Handshake token (optional)
            <input value={token} onChange={(event) => setToken(event.target.value)} />
          </label>
        </div>
      ) : null}

      <button onClick={save}>Save</button>
      {saved && <span className="saved-indicator">Saved</span>}
    </section>
  );
}
