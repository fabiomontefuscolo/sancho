# Contract: Copilot auth bridge + HTTP endpoints

## Bridge envelopes (`src/bridge/messages.ts`)

### `copilot.auth.start` (options → background)

Request: `{}`
Response: `{ userCode: string; verificationUri: string }`
Side effects: creates an in-memory `DeviceFlowSession`, starts polling; any previous session is replaced.

### `copilot.auth.status` (options → background)

Request: `{}`
Response:

```ts
| { status: "disconnected" }
| { status: "pending"; userCode: string; verificationUri: string }
| { status: "connected" }              // CopilotAuth.githubToken present
| { status: "error"; message: string } // denied / expired / network failure
```

`connected` is derived from persisted `CopilotAuth`, so a reopened options page shows it without a new flow.

### `copilot.auth.disconnect` (options → background)

Request: `{}` → Response: `{ ok: true }`
Side effects: deletes `copilotAuth` from `chrome.storage.local`, aborts any pending session.

## External HTTP endpoints (called from background only)

### `POST https://github.com/login/device/code`

Body (form or JSON, `Accept: application/json`): `{ client_id: "Iv1.b507a08c87ecfe98", scope: "read:user" }`
→ `{ device_code, user_code, verification_uri, expires_in, interval }`

### `POST https://github.com/login/oauth/access_token`

Body: `{ client_id, device_code, grant_type: "urn:ietf:params:oauth:grant-type:device_code" }`
→ success `{ access_token, token_type, scope }`
→ pending/errors `{ error: "authorization_pending" | "slow_down" | "expired_token" | "access_denied" | … }`

### `GET https://api.github.com/copilot_internal/v2/token`

Headers: `authorization: token <gho_…>`, `editor-version`, `editor-plugin-version`, `user-agent`, `x-github-api-version: 2025-04-01`
→ `{ token, expires_at }` (unix seconds)

### `POST https://api.githubcopilot.com/chat/completions`

Headers: `authorization: Bearer <session token>`, `copilot-integration-id: vscode-chat`, `editor-version`, `editor-plugin-version: copilot-chat/0.26.7`, `user-agent: GitHubCopilotChat/0.26.7`, `openai-intent: conversation-panel`, `x-github-api-version: 2025-04-01`
Body: OpenAI chat-completions (streamed via `OpenAICompatibleProvider`)

### `GET https://api.githubcopilot.com/models`

Headers: same as chat → `{ data: [{ id, … }] }`

## Error mapping

| Condition                                    | Surfaced as                                                      |
| -------------------------------------------- | ---------------------------------------------------------------- |
| `access_denied` / `expired_token` in polling | `copilot.auth.status` → `{status:"error", message}`              |
| No `githubToken` at send time                | `ProviderNotConfiguredError` → chat error "connect GitHub first" |
| Exchange 401/403 (revoked / no subscription) | chat error "GitHub token rejected — reconnect in Settings"       |
| `/models` fetch failure                      | settings UI falls back to free-text model input                  |
