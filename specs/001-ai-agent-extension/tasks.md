# Tasks: AI Agent Browser Extension

**Input**: Design documents from `/specs/001-ai-agent-extension/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Included — constitution Article VI mandates unit tests (Vitest) for agent
utilities/providers, React Testing Library for components, and ≥80% coverage on
orchestration logic.

**Organization**: Tasks grouped by user story for independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

## Phase 1: Setup (Shared Infrastructure)

- [x] T001 Initialize WXT project with React template and TypeScript strict mode (`strict: true`, `no-explicit-any` error) at repository root
- [x] T002 [P] Configure ESLint (`@typescript-eslint`, `eslint-plugin-react-hooks`) and Prettier in eslint.config.js and .prettierrc
- [x] T003 [P] Configure husky + lint-staged pre-commit hooks running ESLint and Prettier in package.json and .husky/pre-commit
- [x] T004 [P] Configure Vitest with coverage thresholds (≥80% statements/branches for src/agent, src/providers, src/storage) in vitest.config.ts
- [x] T005 [P] Configure Playwright persistent-context harness loading the unpacked extension in tests/e2e/fixtures.ts
- [x] T006 Add assistant-ui dependencies (`@assistant-ui/react`) and scaffold thread components via `npx assistant-ui init` into src/ui/components/

---

## Phase 2: Foundational (Blocking Prerequisites)

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T007 [P] Define all data-model interfaces (ProviderConfig with `method: "api" | "acp"`, ApiKey, Action with `builtin: boolean`, Conversation with `screenshotConsent: boolean`, Message, AgentSession with states `"idle" | "planning" | "acting" | "verifying" | "done" | "stopped" | "error"` and `maxIterations` default 25, ToolCall) in src/types.ts
- [x] T008 Implement sync storage wrapper for ProviderConfig and Action collections in src/storage/settings.ts
- [x] T009 [P] Implement local storage wrapper for ApiKey (keyed by `apiKeyRef`, never synced), Conversation, and transient AgentSession in src/storage/local.ts
- [x] T010 [P] Implement typed message Envelope (`kind: "request" | "response" | "event"`, correlation `id`; unknown types ignored, malformed envelopes dropped and logged) and port helpers in src/bridge/messages.ts per contracts/runtime-messages.md
- [x] T011 Create background service worker entrypoint with port listener for `sancho-ui` and message router in entrypoints/background.ts (event-driven only, no persistent in-memory state)
- [x] T012 Implement on-demand content-script injector using chrome.scripting.executeScript with least-privilege host access in src/agent/inject.ts
- [x] T013 [P] Unit tests for storage wrappers and message envelope round-trip in tests/unit/storage.test.ts and tests/unit/messages.test.ts

**Checkpoint**: Foundation ready — user story implementation can now begin

---

## Phase 3: User Story 2 - Bring Your Own Provider (Priority: P1)

**Goal**: User configures an OpenAI-compatible API provider or a local ACP agent; the
sidebar agent answers through the configured provider.

**Independent Test**: Configure a provider in settings, send a chat message, verify the
response arrives via that provider; verify invalid key produces a clear error without
losing conversation state (quickstart.md Scenario 2).

> Implemented before US1 because US1's agent is unusable without a provider (spec marks
> US1/US2 as co-P1; this story carries the provider layer both need).

### Tests for User Story 2

- [x] T014 [P] [US2] Unit tests for BaseLLMProvider contract: uniform message schema, streaming deltas, tool-call parsing in tests/unit/providers.test.ts
- [x] T015 [P] [US2] Unit tests for ACP transport handshake (token mismatch closes port, NDJSON framing) in tests/unit/acp.test.ts

### Implementation for User Story 2

- [x] T016 [US2] Implement BaseLLMProvider abstract class (stream, message history schema, structural tool output) in src/providers/base.ts
- [x] T017 [US2] Implement OpenAI-compatible provider using Vercel AI SDK v5 (`ai` + `@ai-sdk/openai-compatible`, browser-safe build) with configurable `baseUrl` (https required, http allowed on loopback) and `model` in src/providers/openai-compatible.ts
- [x] T018 [US2] Implement ACP provider using `@agentclientprotocol/sdk` over Native Messaging (`chrome.runtime.connectNative` to `ProviderConfig.acp.hostName`, `{ "type": "handshake", "token" }` first message, `initialize`/`session/new`/`session/prompt`/`session/cancel`) in src/providers/acp.ts per contracts/acp-transport.md
- [x] T019 [US2] Implement provider factory reading ProviderConfig from sync storage and resolving ApiKey from local storage in src/providers/factory.ts
- [ ] T020 [US2] Wire connection-failure handling (`chat.error` with actionable message, conversation preserved; ACP disconnect sets `AgentSession.state = "error"`) in entrypoints/background.ts

**Checkpoint**: Provider layer works standalone; chat.send round-trips through either method

---

## Phase 4: User Story 1 - Chat Sidebar with Page-Aware Agent (Priority: P1) 🎯 MVP

**Goal**: Side-panel chat where the agent autonomously reads the page, fills forms,
clicks elements, and analyzes screenshots — within a capped deterministic loop.

**Independent Test**: Open the sidebar on any page, ask for a summary and a form fill;
verify streamed responses and that native form validation accepts filled values
(quickstart.md Scenario 1).

### Tests for User Story 1

- [ ] T021 [P] [US1] Unit tests for the agent loop state machine: transitions `idle → planning → acting → verifying → planning … → done|stopped|error`, forced `stopped` at `iteration >= maxIterations` (25) with user-facing message in tests/unit/agent-loop.test.ts
- [ ] T022 [P] [US1] Unit tests for tool executors: Zod argument validation, native event dispatch (InputEvent/ChangeEvent/MouseEvent sequence), `readPage` output capped at ~8k tokens with raw HTML stripped in tests/unit/tools.test.ts
- [ ] T023 [P] [US1] Component tests for the side panel: streaming render, tool-call display, consent prompt on `consent_required` in tests/component/sidepanel.test.tsx

### Implementation for User Story 1

- [ ] T024 [P] [US1] Implement Zod schemas and executors for readPage, fillField, clickElement, selectOption, captureScreenshot in src/agent/tools.ts per contracts/tools.md (declarative only, no eval)
- [ ] T025 [US1] Implement captureScreenshot consent gate: fail with `{ ok: false, error: "consent_required" }` unless `Conversation.screenshotConsent === true`; image held in-memory as base64 in src/agent/tools.ts
- [ ] T026 [US1] Implement deterministic Plan → Act → Verify loop with AgentSession persisted to local storage each iteration (service-worker-restart safe) in src/agent/loop.ts
- [ ] T027 [US1] Implement content-script handlers for `page.read` (structural minification + semantic chunking), `page.fill`, `page.click`, `page.select`, `selection.get`, `selection.replace` with native events in entrypoints/content.ts per contracts/runtime-messages.md
- [ ] T028 [US1] Build side panel UI with assistant-ui Thread wired to a custom ExternalStoreRuntime bridged over the `sancho-ui` port (chat.send/chat.delta/chat.tool/chat.done/chat.error, conversation.get/conversation.state, screenshot.consent) in entrypoints/sidepanel/main.tsx and src/ui/hooks/useSanchoRuntime.ts
- [ ] T029 [US1] Implement active-tab page context: `tabId` tracked per message, context follows the newly active tab in the single global conversation in entrypoints/background.ts
- [ ] T030 [US1] Implement chat.cancel (maps to ACP `session/cancel`) and chat.clear (resets conversation AND `screenshotConsent`) in entrypoints/background.ts
- [ ] T031 [US1] Implement graceful degradation on restricted pages: chat stays available, page tools report unavailable in entrypoints/background.ts and entrypoints/content.ts
- [ ] T032 [US1] Implement screenshot capture via chrome.tabs.captureVisibleTab in-memory only (base64 image part, never stored or forwarded without consent) in entrypoints/background.ts

**Checkpoint**: MVP — sidebar agent chats, reads, acts, and analyzes within loop caps

---

## Phase 5: User Story 3 - Selection Actions on Editable Text (Priority: P2)

**Goal**: Right-click selected text → built-in actions ("Improve writing", "Make it
formal", "Fix grammar"); editable selections are replaced in place, read-only selections
post results to the sidebar.

**Independent Test**: Select text in an editable field, run "Fix grammar", verify
in-place replacement; select read-only text, verify result appears in the sidebar and the
page is untouched (quickstart.md Scenario 3).

### Tests for User Story 3

- [ ] T033 [P] [US3] Unit tests for action dispatch: editable → `selection.replace`, read-only → `action.result` to chat; failure leaves selection untouched and notifies user in tests/unit/actions.test.ts
- [ ] T034 [P] [US3] E2E test: context-menu action on a real reactive form field replaces selection with native events in tests/e2e/selection-actions.spec.ts

### Implementation for User Story 3

- [ ] T035 [US3] Register context menus from enabled Action records and rebuild the menu on every storage change in entrypoints/background.ts
- [ ] T036 [US3] Implement action.run handler: detect `editable` via `selection.get`, run the action prompt through the provider, then `selection.replace` (editable, native events) or append result to the sidebar conversation (read-only) in entrypoints/background.ts
- [ ] T037 [US3] Seed built-in actions (`improve-writing`, `make-formal`, `fix-grammar`) with `builtin: true` and their prompts on install in src/storage/settings.ts
- [ ] T038 [US3] Guard concurrent actions on the same field so replacements cannot interleave in src/agent/actions.ts

**Checkpoint**: Built-in selection actions work on editable and read-only text

---

## Phase 6: User Story 4 - Custom User-Defined Actions (Priority: P2)

**Goal**: Users create/edit/delete actions (name 1–50 chars unique per user, prompt with
selected-text embedding); custom actions appear in the selection context menu.

**Independent Test**: Create "Translate to Spanish" in settings, invoke it from the
context menu on a selection, verify the prompt drives the result (quickstart.md
Scenario 3, step 3).

### Tests for User Story 4

- [ ] T039 [P] [US4] Unit tests for Action CRUD validation: name uniqueness, length limits, built-ins can be hidden (`enabled: false`) but not deleted in tests/unit/action-crud.test.ts
- [ ] T040 [P] [US4] Component test for the action editor form (create, edit, delete flows) in tests/component/action-editor.test.tsx

### Implementation for User Story 4

- [ ] T041 [US4] Implement actions.list / actions.upsert / actions.delete message handlers over the `sancho-ui` port with validation in entrypoints/background.ts
- [ ] T042 [US4] Build the action management UI (list, editor form, enable/disable toggle) as part of the options page in entrypoints/options/main.tsx

**Checkpoint**: Custom actions are manageable and immediately usable from the context menu

---

## Phase 7: User Story 5 - Settings Page Styled Like Browser Settings (Priority: P3)

**Goal**: Options page for connection-method selection and action management, visually
following the browser's native settings conventions.

**Independent Test**: Open options, switch connection methods (only relevant fields
shown), verify saved values restore on reopen (quickstart.md Scenario 4).

### Tests for User Story 5

- [ ] T043 [P] [US5] Component tests: method switch toggles api/acp field groups; settings persist and restore via settings.get/settings.set in tests/component/options.test.tsx

### Implementation for User Story 5

- [ ] T044 [US5] Implement settings.get / settings.set handlers; settings.set MUST move API keys to local storage and return only `apiKeyRef` in entrypoints/background.ts
- [ ] T045 [US5] Build the settings page layout (side-nav sections, form rows, browser-settings look) with provider picker (`openai`, `kimi`, `deepseek`, `openrouter`, `custom`), baseUrl/model fields, and ACP host/token fields in entrypoints/options/main.tsx and src/ui/components/settings/

**Checkpoint**: Full configuration manageable from a browser-native-looking settings page

---

## Phase 8: Polish & Cross-Cutting Concerns

- [ ] T046 [P] E2E test for loop-cap simulation: runaway loop stops at 25 iterations with user-facing stop message in tests/e2e/agent-loop.spec.ts
- [ ] T047 [P] E2E test for screenshot consent flow: prompt → grant → works for conversation → cleared conversation requires consent again in tests/e2e/screenshot-consent.spec.ts
- [ ] T048 Verify coverage gates (≥80% statements/branches on src/agent, src/providers, src/storage) and wire into CI in vitest.config.ts
- [ ] T049 [P] Restricted-page degradation E2E on chrome:// and web store pages in tests/e2e/restricted-pages.spec.ts
- [ ] T050 Run full quickstart.md validation (all 5 scenarios) and fix any failures

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies
- **Foundational (Phase 2)**: depends on Phase 1 — BLOCKS all stories
- **US2 (Phase 3)**: depends on Phase 2; provides the provider layer US1 builds on
- **US1 (Phase 4)**: depends on US2 (needs a working provider to chat)
- **US3 (Phase 5)**: depends on US2 (provider) and US1's content-script handlers (T027)
- **US4 (Phase 6)**: depends on US3 (extends the action/menu mechanism)
- **US5 (Phase 7)**: depends on Phase 2 only; can run in parallel with US3–US4 after US1
- **Polish (Phase 8)**: depends on all desired stories

### Parallel Opportunities

- Phase 1: T002, T003, T004, T005, T006 in parallel
- Phase 2: T007/T009/T010 parallel; T013 after T008–T010
- US2: T014 ∥ T015; T017 ∥ T018 after T016
- US1: T021 ∥ T022 ∥ T023 (tests); T024 then T025 ∥ T027 ∥ T028
- US3: T033 ∥ T034; US4: T039 ∥ T040
- After US1 completes: US3+US4 chain and US5 can proceed in parallel

---

## Parallel Example: User Story 1

```bash
# Launch all US1 tests together (write first, ensure they fail):
Task: "Unit tests for the agent loop state machine in tests/unit/agent-loop.test.ts"
Task: "Unit tests for tool executors in tests/unit/tools.test.ts"
Task: "Component tests for the side panel in tests/component/sidepanel.test.tsx"

# Then parallelize independent implementation files:
Task: "Zod schemas and executors in src/agent/tools.ts"
Task: "Content-script handlers in entrypoints/content.ts"
Task: "Side panel UI in entrypoints/sidepanel/main.tsx"
```

---

## Implementation Strategy

### MVP First

1. Phase 1 (Setup) → Phase 2 (Foundational) → Phase 3 (US2 providers) → Phase 4 (US1 sidebar agent)
2. **STOP and VALIDATE**: quickstart.md Scenarios 1–2
3. Demo-able MVP: a working page-aware chat agent with BYO provider

### Incremental Delivery

1. MVP (US2 + US1) → validate
2. US3 selection actions → validate Scenario 3
3. US4 custom actions → validate Scenario 3 step 3
4. US5 settings polish → validate Scenario 4
5. Phase 8 gates → full quickstart validation
