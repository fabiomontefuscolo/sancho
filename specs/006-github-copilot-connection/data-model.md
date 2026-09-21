# Data Model: GitHub Copilot Connection Method

## CopilotAuth (new, `chrome.storage.local`, key `copilotAuth`)

```ts
interface CopilotAuth {
  githubToken: string; // "gho_…" from the device flow; long-lived until revoked
  copilotToken?: string; // session token from copilot_internal/v2/token (~30 min)
  copilotTokenExpiresAt?: number; // unix seconds
}
```

- Never synced (consistent with API keys in `src/storage/local.ts`).
- Written: on device-flow success (githubToken), on each session-token exchange (copilotToken + expiry).
- Deleted: on Disconnect.

## ProviderConfig (existing, extended)

```ts
type ConnectionMethod = "api" | "acp" | "copilot"; // + "copilot"
```

For `method: "copilot"` the config is:

```ts
{
  method: "copilot",
  providerId: "copilot",
  baseUrl: "https://api.githubcopilot.com", // fixed; validateBaseUrl passes (https)
  model: "<user-chosen model id>",          // required, from /models or free-text
  apiKeyRef: "copilot",                      // sentinel; real secret is CopilotAuth
  // no acp field
}
```

## DeviceFlowSession (ephemeral, in-memory in background)

```ts
interface DeviceFlowSession {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  interval: number; // seconds, grows on slow_down
  expiresAt: number; // ms epoch
  status: "pending" | "authorized" | "denied" | "expired" | "error";
  error?: string;
}
```

- Lives only for the duration of a flow; never persisted.
- `copilot.auth.start` creates it (replacing any previous), `copilot.auth.status` reads it.

## Validation rules

- `settings.set` with `method: "copilot"`: `model` must be non-empty; no baseUrl/apiKey validation (fixed values).
- `createProvider()` with `method: "copilot"`: throws `ProviderNotConfiguredError` when no `CopilotAuth.githubToken`; session-token exchange failure maps to a chat error telling the user to reconnect.

## Relationships

```
ProviderConfig (sync, method "copilot")
   │ providerId/apiKeyRef sentinel "copilot"
   ▼
createProvider() ──reads──► CopilotAuth (local)
   │                              │ expired/missing session token
   │                              ▼
   │                    GET copilot_internal/v2/token (githubToken)
   ▼                              │
OpenAICompatibleProvider ◄── copilotToken + Copilot headers
   │
   ▼
POST api.githubcopilot.com/chat/completions
GET  api.githubcopilot.com/models  (settings UI model picker)
```
