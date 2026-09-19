import { useEffect, useState } from "react";
import type { ConnectionMethod, ProviderConfig } from "../../types";
import { DEFAULT_BASE_URLS, DEFAULT_PROVIDER_IDS } from "../../storage/settings";

export interface SettingsBridge {
  requestSettings(): void;
  saveSettings(config: ProviderConfig, apiKey?: string): void;
  onSettings(
    listener: (state: { config: ProviderConfig | null; hasApiKey: boolean }) => void,
  ): () => void;
}

export function SettingsPanel({ bridge }: { bridge: SettingsBridge }) {
  const [method, setMethod] = useState<ConnectionMethod>("api");
  const [providerId, setProviderId] = useState<string>("openai");
  const [baseUrl, setBaseUrl] = useState(DEFAULT_BASE_URLS.openai ?? "");
  const [model, setModel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [hostName, setHostName] = useState("sancho-acp-host");
  const [token, setToken] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    bridge.requestSettings();
    return bridge.onSettings(({ config }) => {
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
  }, [bridge]);

  const selectProvider = (next: string) => {
    setProviderId(next);
    setBaseUrl(DEFAULT_BASE_URLS[next] ?? "");
  };

  const save = () => {
    const config: ProviderConfig =
      method === "api"
        ? { method, providerId, baseUrl, model, apiKeyRef: providerId }
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
      </fieldset>

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
      ) : (
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
      )}

      <button onClick={save}>Save</button>
      {saved && <span className="saved-indicator">Saved</span>}
    </section>
  );
}
