# Implementation Plan: GitHub Copilot Connection Method

**Branch**: `006-github-copilot-connection` | **Date**: 2026-09-21 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/006-github-copilot-connection/spec.md`

## Summary

Add a third connection method "GitHub Copilot". Auth uses the GitHub OAuth **device flow** with the public Copilot client ID (`Iv1.b507a08c87ecfe98`, scope `read:user`): the settings UI shows a user code and opens github.com/login/device while the background polls for completion. The resulting GitHub token is stored in `chrome.storage.local` and exchanged — transparently, before each send when expired — for a short-lived Copilot session token at `api.github.com/copilot_internal/v2/token`. Chat reuses the existing `OpenAICompatibleProvider` against `https://api.githubcopilot.com` with additional Copilot-specific headers (new optional `headers` option). The settings panel fetches `/models` after connecting to populate a model dropdown (free-text fallback), shows an inline unofficial-API disclaimer, and offers Disconnect.

## Technical Context

**Language/Version**: TypeScript 5 (strict mode, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`)

**Primary Dependencies**: existing `@ai-sdk/openai-compatible` + `ai` SDK (via `OpenAICompatibleProvider`); `fetch` for the three GitHub/Copilot auth endpoints; no new runtime dependencies

**Storage**: `chrome.storage.local` key `copilotAuth` → `{ githubToken, copilotToken?, copilotTokenExpiresAt? }`; `ProviderConfig` (chrome.storage.sync) gains method `"copilot"` with fixed baseUrl, chosen model, `apiKeyRef: "copilot"` (unused sentinel)

**Testing**: Vitest + jsdom (unit: device-flow polling, token cache/refresh, factory branch, headers; component: settings panel copilot states); existing e2e suite unchanged (mock LLM)

**Target Platform**: Chromium MV3; auth polling runs in the background service worker while the options page port is open

**Performance Goals**: token refresh adds < 1s to a send and only happens ~every 30 min; options page shows connected state from local storage without network calls

**Constraints**: MV3 service worker may be killed — polling only continues while the options port is open; on disconnect the flow aborts and the code expires. No `chrome.identity` API used (device flow needs no redirect). Secrets stay in `chrome.storage.local`, plain text, consistent with existing API keys

**Scale/Scope**: new `src/auth/copilot.ts`; edits to `src/types.ts`, `src/storage/settings.ts`, `src/providers/openai-compatible.ts`, `src/providers/factory.ts`, `src/bridge/messages.ts`, `src/agent/settings-handler.ts`, `src/ui/components/settings-panel.tsx`, `entrypoints/background.ts`, `src/ui/hooks/useOptionsBridge.ts`

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| #   | Principle                     | Verdict                                                                                                                                            |
| --- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| I   | MV3 core architecture         | PASS — all network calls from the background service worker; no content-script changes, no new permissions (host_permissions already `<all_urls>`) |
| II  | Unified multi-provider layer  | PASS — copilot is a new branch in `createProvider()` returning the existing `BaseLLMProvider` abstraction; agent loop untouched                    |
| III | Local agent & ACP integration | PASS — ACP path untouched                                                                                                                          |
| IV  | Browser automation & security | PASS — token in `chrome.storage.local` (never synced), consistent with existing API keys; inline disclaimer; disconnect wipes all auth data        |
| V   | React UI stack & state sync   | PASS — settings panel extended via the existing `SettingsBridge`/envelope protocol; new `copilot.auth.*` envelopes follow the same pattern         |
| VI  | Strict typing & quality gates | PASS — no `any`; unit + component tests; `pnpm typecheck && pnpm lint && pnpm exec vitest run && pnpm build && pnpm test:e2e` gates                |

## Project Structure

### Documentation (this feature)

```text
specs/006-github-copilot-connection/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── auth-contract.md
└── tasks.md
```

### Source Code (repository root)

```text
src/
├── auth/
│   └── copilot.ts              # NEW: device-flow start/poll, session-token exchange + cache/refresh, disconnect
├── types.ts                    # ConnectionMethod + "copilot"
├── storage/settings.ts         # defaults for copilot (baseUrl, provider id)
├── bridge/messages.ts          # copilot.auth.start / copilot.auth.status / copilot.auth.disconnect envelopes
├── providers/
│   ├── openai-compatible.ts    # optional headers option
│   └── factory.ts              # copilot branch: resolve session token, build provider with Copilot headers
├── agent/settings-handler.ts   # validation branch for copilot
└── ui/
    ├── hooks/useOptionsBridge.ts  # copilot auth bridge methods
    └── components/settings-panel.tsx  # third radio, connect/pending/connected UI, model dropdown + fallback, disclaimer, disconnect

entrypoints/
└── background.ts               # copilot.auth.* handlers

tests/
├── unit/
│   ├── copilot-auth.test.ts    # device flow polling, slow_down, errors, token cache/refresh, disconnect
│   ├── factory.test.ts         # copilot branch (extended)
│   └── openai-compatible.test.ts  # custom headers passed through (extended)
└── component/
    └── options.test.tsx        # copilot form states (extended)
```

**Structure Decision**: Auth logic lives in a pure, injectable-`fetch` module `src/auth/copilot.ts` (jsdom-testable), wired by thin background handlers; the provider path reuses `OpenAICompatibleProvider` per the OpenAI-compatible nature of the endpoint.

## Complexity Tracking

No constitution violations — section intentionally empty.
