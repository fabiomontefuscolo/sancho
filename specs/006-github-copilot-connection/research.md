# Research: GitHub Copilot Connection Method

## Decision: OAuth device flow over `chrome.identity.launchWebAuthFlow`

**Chosen**: Device flow (`POST /login/device/code` → poll `/login/oauth/access_token`).

- No OAuth app registration needed: the public Copilot client ID `Iv1.b507a08c87ecfe98` (used by copilot.vim, copilot-api, opencode) already has device flow enabled, and only that client ID's tokens are accepted by the internal Copilot token endpoint.
- No redirect URI, no `identity` permission, no `client_secret` (device flow doesn't use one).
- `launchWebAuthFlow` with a self-registered OAuth app was rejected: tokens from arbitrary OAuth apps are not accepted by `copilot_internal/v2/token`, and it adds a chromiumapp.org redirect dance for zero benefit.

**Flow details** (GitHub docs, verified):

1. `POST https://github.com/login/device/code` — `{client_id, scope: "read:user"}`, `Accept: application/json` → `{device_code, user_code, verification_uri, expires_in (900), interval (5)}`.
2. UI shows `user_code`, opens `verification_uri` in a new tab.
3. Poll `POST https://github.com/login/oauth/access_token` — `{client_id, device_code, grant_type: "urn:ietf:params:oauth:grant-type:device_code"}` every `interval` seconds. Error responses: `authorization_pending` (keep polling), `slow_down` (add 5s to interval), `expired_token`, `access_denied` → terminal states.
4. Success → `{access_token: "gho_…", token_type, scope}`.

## Decision: session-token exchange + cache

**Chosen**: `GET https://api.github.com/copilot_internal/v2/token` with `Authorization: token <gho_…>` → `{token, expires_at}` (unix seconds, ~30 min lifetime). Cache in `chrome.storage.local`; refresh when `expires_at - now < 60s`. A single in-flight refresh promise dedupes concurrent sends.

- Alternative "refresh on 401 only" rejected: a mid-stream 401 loses the whole run; preemptive refresh is deterministic and cheap.
- Refresh cadence: at most one extra request per ~30 min of active use (SC-002).

## Decision: chat endpoint via existing `OpenAICompatibleProvider` + `headers` option

**Chosen**: `https://api.githubcopilot.com/chat/completions` is OpenAI-compatible; `@ai-sdk/openai-compatible`'s `createOpenAICompatible` accepts a `headers` map. Add an optional `headers?: Record<string, string>` to `OpenAICompatibleProviderOptions` and pass through.

Required headers (from the reference implementation, ericc-ch/copilot-api `api-config.ts`):

- `Authorization: Bearer <session token>`
- `copilot-integration-id: vscode-chat`
- `editor-version: vscode/<version>` / `editor-plugin-version: copilot-chat/0.26.7`
- `user-agent: GitHubCopilotChat/0.26.7`
- `openai-intent: conversation-panel`
- `x-github-api-version: 2025-04-01`

The same headers (minus Authorization) go on the token-exchange and `/models` calls, with `Authorization: token <gho_…>` for the exchange.

## Decision: model list from `GET https://api.githubcopilot.com/models`

Response `{data: [{id, …}]}` (OpenAI shape). Fetched once per options-page load when connected; failure → free-text input fallback (spec US3). Saved model is sent verbatim even if no longer listed.

## Decision: auth state shape & lifecycle

`chrome.storage.local["copilotAuth"] = { githubToken, copilotToken?, copilotTokenExpiresAt? }` (see data-model.md). Disconnect deletes the key. Revocation surfaces as 401 on the exchange → mapped to a "reconnect" error; the UI returns to disconnected state only via explicit Disconnect (a revoked token errors clearly in chat, FR-006).

## Decision: polling lifetime in MV3

Polling runs in the background service worker and continues only while the options page port is open (ports keep the SW alive). Options closed mid-flow → polling stops, code expires server-side (900s); next `copilot.auth.status` returns `disconnected`. `chrome.alarms`-based resume was rejected as needless complexity for a 15-minute, user-present flow.

## Alternatives considered

- **GitHub Models (models.github.ai)**: official but PAT-only — violates the "no credentials" goal.
- **PKCE web flow with own OAuth app**: needs app registration and doesn't unlock the Copilot endpoint.
- **New `CopilotProvider` subclass**: rejected — behavior is identical to `OpenAICompatibleProvider` + headers; subclassing would duplicate streamChat logic for zero behavior change.
