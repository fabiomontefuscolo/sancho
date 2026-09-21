# Tasks: GitHub Copilot Connection Method

**Input**: Design documents from `/specs/006-github-copilot-connection/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/auth-contract.md, quickstart.md

**Tests**: Included — constitution principle V mandates executable tests, and the spec defines per-story acceptance scenarios.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1–US4)
- All paths are relative to the repository root

## Phase 1: Setup

- [x] T001 Verify baseline gates pass before starting (`pnpm typecheck && pnpm exec vitest run`)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: auth module + types that all stories depend on

- [x] T002 [P] Create tests/unit/copilot-auth.test.ts covering `startDeviceFlow` (posts client_id/scope, returns user code/uri), `pollForDeviceToken` (authorized → token; authorization_pending keeps polling; slow_down grows interval; access_denied/expired_token → terminal error), `getCopilotToken` (cache hit, refresh when expiring, deduped concurrent refresh), `disconnectCopilot` (wipes storage) — all with stubbed fetch + mock-chrome
- [x] T003 Create src/auth/copilot.ts per data-model.md and contracts/auth-contract.md: constants (client id, scope, headers, endpoints), `CopilotAuth` storage in chrome.storage.local key `copilotAuth` (load/save/clear), `startDeviceFlow(fetch?)`, `pollForDeviceToken(session, fetch?, sleep?)`, `getCopilotToken(fetch?)` with 60s expiry margin and single in-flight refresh, `disconnectCopilot()`
- [x] T004 [P] Extend src/types.ts `ConnectionMethod` with `"copilot"` and add copilot defaults to src/storage/settings.ts (provider id + fixed baseUrl `https://api.githubcopilot.com`)
- [x] T005 [P] Add optional `headers?: Record<string, string>` to `OpenAICompatibleProviderOptions` in src/providers/openai-compatible.ts, passed to `createOpenAICompatible`; extend tests/unit/openai-compatible.test.ts asserting custom headers reach the wire request

**Checkpoint**: copilot-auth unit tests green; provider accepts custom headers

---

## Phase 3: User Story 1 - Connect with GitHub without credentials (Priority: P1) 🎯 MVP

**Goal**: device flow from the settings UI; connected state persists across options-page loads

**Independent Test**: start flow from Settings, authorize on GitHub, panel shows connected — no credential typed

- [x] T006 [P] [US1] Add `copilot.auth.start` / `copilot.auth.status` / `copilot.auth.disconnect` envelopes to src/bridge/messages.ts per contracts/auth-contract.md
- [x] T007 [US1] Add background handlers in entrypoints/background.ts: start creates/replaces the in-memory DeviceFlowSession and polls while the port is open; status derives `connected` from persisted auth, `pending` from the live session, `error` from terminal poll states; disconnect clears storage and aborts the session
- [x] T008 [P] [US1] Extend src/ui/hooks/useOptionsBridge.ts (SettingsBridge) with `copilotAuthStart()`, `copilotAuthStatus()`, `copilotAuthDisconnect()`
- [x] T009 [US1] Extend src/ui/components/settings-panel.tsx: third radio "GitHub Copilot"; disconnected state shows Connect button + disclaimer note; clicking Connect shows the user code + opens verificationUri in a new tab; poll status while pending; connected state shows "Connected to GitHub" + Disconnect button; save() builds the copilot ProviderConfig per data-model.md
- [x] T010 [US1] Add copilot validation branch to src/agent/settings-handler.ts (model non-empty; skip baseUrl/apiKey checks)
- [x] T011 [US1] Extend tests/component/options.test.tsx: copilot radio renders Connect button + disclaimer; pending state shows the code; connected state (status stubbed) shows Disconnect; disconnect returns to the connect state

**Checkpoint**: component tests green; manual device-flow smoke test possible

---

## Phase 4: User Story 2 - Chat via Copilot with transparent refresh (Priority: P1)

**Goal**: `createProvider()` resolves the session token and builds the provider; expiry/revocation handled

**Independent Test**: send a chat message on the copilot method; with an expired cached token the send still succeeds after a silent refresh

- [x] T012 [US2] Extend tests/unit/factory.test.ts: copilot config + stored auth → `OpenAICompatibleProvider` with id `copilot` and Copilot headers; no stored auth → `ProviderNotConfiguredError`; expiring cached token triggers one exchange before constructing
- [x] T013 [US2] Add copilot branch to src/providers/factory.ts: `getCopilotToken()` then `new OpenAICompatibleProvider({ providerId: "copilot", baseUrl, model, apiKey: sessionToken, headers: COPILOT_HEADERS })`; exchange 401/403 maps to a "reconnect in Settings" error
- [ ] T014 [US2] Manual validation: real device flow + chat send + context-menu action via Copilot in Brave (quickstart.md steps 1–7)

**Checkpoint**: factory tests green; manual chat through Copilot works

---

## Phase 5: User Story 3 - Model picker from /models (Priority: P2)

**Goal**: connected panel fetches the model list into a dropdown; free-text fallback

**Independent Test**: dropdown lists models from the endpoint; with the fetch failing, a text input still allows saving

- [x] T015 [P] [US3] Add `listCopilotModels(fetch?)` to src/auth/copilot.ts (`GET /models` with Copilot headers, session token via `getCopilotToken`), unit-tested in tests/unit/copilot-auth.test.ts
- [x] T016 [US3] Settings panel: on connected state, fetch models via the background (reuse an envelope or extend status response) and render a `<select>`; on fetch failure render the existing free-text input; preselect the saved model
- [x] T017 [US3] Component test: dropdown populated from stubbed list; fallback input on fetch failure; saved model preselected

**Checkpoint**: model picker covered by component tests

---

## Phase 6: User Story 4 - Disclaimer & disconnect polish (Priority: P3)

- [x] T018 [US4] Verify disclaimer visible in both connected and disconnected states and Disconnect wipes `copilotAuth` (component test assertions; adjust copy if needed)

---

## Phase 7: Polish & Cross-Cutting

- [x] T019 Run full gates: `pnpm typecheck && pnpm lint && pnpm exec vitest run && pnpm build && pnpm test:e2e`; verify no regression in api/acp tests
- [ ] T020 Manual full quickstart pass in Brave (steps 1–9), including 30-min-refresh simulation and disconnect
- [ ] T021 Update spec status to Implemented; verify all acceptance scenarios covered

## Dependencies & Execution Order

- T001 → T002–T005 (foundational) → US1 (T006–T011) → US2 (T012–T014) → US3 (T015–T017) → US4 (T018) → polish (T019–T021)
- [P] tasks touch different files and can run in parallel
- US1/US2 are both P1: US2's factory branch is testable with a stubbed token, but the end-to-end story needs US1's flow for real tokens

## Implementation Strategy

- MVP = Phases 1–4 (connect + chat works end-to-end)
- TDD per task: failing test first, then implementation, then commit
- Commit after each task or logically grouped pair; mark tasks `[X]` as completed; manual Brave validation tasks (T014, T020) left unchecked for the user

## Phase 8: Convergence

- [x] T022 Abort the pending device-flow polling when the initiating options port disconnects (port.onDisconnect → abort the session's AbortController in src/agent/copilot-auth-handler.ts, wire the disconnect listener where handlers are registered in entrypoints/background.ts) so a closed options page stops polling instead of running until code expiry and posting to a dead port per spec edge case "Options page closed mid-flow" and research.md polling-lifetime decision (partial)
