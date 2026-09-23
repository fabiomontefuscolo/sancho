---
description: "Task list for Page Diagnostics Tools (009)"
---

# Tasks: Page Diagnostics Tools

**Input**: Design documents from `/specs/009-page-diagnostics-tools/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/diagnostics-tools.md

**Tests**: Included — the project constitution mandates unit/component tests with ≥80% coverage on `src/agent`, `src/providers`, `src/storage`. Write tests FIRST and watch them fail before implementing.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- Single-project extension: `src/`, `entrypoints/`, `native-host/`, `tests/` at repository root

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Baseline + manifest permission

- [x] T001 Run `pnpm exec vitest run && pnpm lint && pnpm typecheck` to confirm a green baseline
- [x] T002 Add `"webRequest"` to `manifest.permissions` in wxt.config.ts (metadata-only observation; no `webRequestBlocking`)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The `diagnosticsConsent` flag and its bridge/background plumbing — every story depends on it

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T003 [P] Add failing tests in tests/unit/storage.test.ts: `createConversation` defaults `diagnosticsConsent` to `false`; saving a record with `diagnosticsConsent: true` persists and re-reads as `true`; a fresh conversation after `chat.clear` semantics is `false` again (mirror the existing screenshotConsent tests)
- [x] T004 Implement the flag: add `diagnosticsConsent: boolean` to `Conversation` in src/types.ts and default `diagnosticsConsent: false` in `createConversation` in src/storage/conversations.ts
- [x] T005 [P] Add failing handler tests in tests/unit/handlers.test.ts: a `diagnostics.consent` request with `{ granted: true }` sets `diagnosticsConsent` on the active conversation and re-posts `conversation.state` (mirror the `screenshot.consent` tests at handlers.test.ts:101-108)
- [x] T006 Implement the bridge + handler: add `diagnostics.consent` request op and `DiagnosticsConsentPayload { granted: boolean }` to src/bridge/messages.ts; add `handleDiagnosticsConsent` in src/agent/chat-handler.ts (clone `handleScreenshotConsent`); register it in entrypoints/background.ts routing and add the op to `SEQUENTIAL_OPS`

**Checkpoint**: Consent flag round-trips end-to-end over the bridge; stories can start

---

## Phase 3: User Story 1 - Agent inspects console errors on the active page (Priority: P1) 🎯 MVP

**Goal**: The agent can read recent console messages/errors from the active tab, consent-gated, with early (document_start) capture and per-navigation scoping

**Independent Test**: On a page logging a known error, grant consent, ask "check the console errors", verify the reply names the error (quickstart S1–S3, S7, S8)

### Tests for User Story 1 ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [x] T007 [P] [US1] Extend tests/unit/tools.test.ts: add `getConsoleMessages` and `getNetworkRequests` to the sorted tool-name assertion; add schema tests for `getConsoleMessages` — `limit` defaults to 50, must be 1–200; `level` optional enum of `log|info|warn|error|exception`; unknown args rejected per existing patterns
- [x] T008 [P] [US1] Add failing tests in tests/unit/agent-glue.test.ts: `executeTool("getConsoleMessages")` without consent returns `{ ok: false, error: "diagnostics_consent_required" }` without calling the content script; with consent it sends `console.read` via `sendToContent` and returns `{ ok: true, entries, truncated }` (extend the mock-chrome `tabs.sendMessage` handler for `console.read` in tests/unit/helpers/mock-chrome.ts)

### Implementation for User Story 1

- [x] T009 [P] [US1] Create the MAIN-world probe entrypoints/diag-probe.ts: wrap `console.log/info/warn/error` and capture `window.onerror` + `unhandledrejection` into a ring buffer capped at **200 entries**, entry text args-joined and **truncated to 500 chars**, shape `{ level, text, timestamp }`; answer `window.postMessage` `{ source: "sancho-diag", type: "console.read" }` (verify `event.source === window`) with `{ source: "sancho-diag-probe", type: "console.entries", entries }`
- [x] T010 [US1] Add the `console.read` handler to the message switch in entrypoints/content.ts: relay the read to the probe via `postMessage`, await the `sancho-diag-probe` reply with a 2 s timeout, and on timeout return `{ ok: true, entries: [], note: "probe unavailable" }`
- [x] T011 [US1] Register the probe in entrypoints/background.ts via `chrome.scripting.registerContentScripts` on SW startup and `runtime.onInstalled`: id `sancho-diag-probe`, `world: "MAIN"`, `runAt: "document_start"`, `matches: ["<all_urls>"]`, `allFrames: false`; tolerate already-registered errors (unregister-then-register or catch duplicate id)
- [x] T012 [US1] Add the tool in src/agent/tools.ts: zod schema + `toolDefinitions` entry for `getConsoleMessages` per contracts/diagnostics-tools.md; in `executeTool` check `getActiveConversation().diagnosticsConsent` first (return `{ ok: false, error: "diagnostics_consent_required" }` when false), then `sendToContent(tabId, { type: "console.read" })`, apply the `limit`/`level` filters, and return `{ ok: true, entries, truncated }` — untrusted entry text passes through as data only

**Checkpoint**: US1 functional — console diagnosis works end-to-end with consent on a real page

---

## Phase 4: User Story 2 - Agent inspects network request outcomes (Priority: P2)

**Goal**: The agent can list recent network request metadata (URL, method, status/failure, timing) for the active tab, consent-gated, metadata only

**Independent Test**: On a page making a failing request, grant consent, ask "did any requests fail?", verify the reply names URL + outcome and never includes bodies (quickstart S4–S5)

### Tests for User Story 2 ⚠️

- [x] T013 [P] [US2] Create failing tests in tests/unit/diagnostics.test.ts: recorder appends `{ url, method, status | error, startTime, durationMs }`; **URL truncated to 300 chars**; ring buffer keeps only the most recent **100 entries**; navigation reset clears the tab's buffer; batched flush writes to `chrome.storage.session` key `diagNet:<tabId>` after 25 events or on a 2 s timer; reads return most-recent-first with `limit` applied
- [x] T014 [P] [US2] Extend tests/unit/agent-glue.test.ts: `executeTool("getNetworkRequests")` without consent returns the diagnostics consent error; with consent returns buffered records for the active tab only; `limit` defaults to 50 and is capped at 100

### Implementation for User Story 2

- [x] T015 [US2] Create src/agent/diagnostics.ts: `NetworkRequestRecord` type; `recordRequestCompleted`/`recordRequestError` handlers reading from `chrome.webRequest` event details; per-tab ring buffer (100 entries) in `chrome.storage.session` with batched flush (25 events or 2 s); `resetTabDiagnostics(tabId)`; `getNetworkRequests(tabId, limit)` reader (most-recent-first, `truncated` flag)
- [x] T016 [US2] Wire listeners in entrypoints/background.ts: `chrome.webRequest.onCompleted` and `chrome.webRequest.onErrorOccurred` (filter `urls: ["<all_urls>"]`) → diagnostics recorder; `chrome.tabs.onUpdated` (status `loading` with URL change) → `resetTabDiagnostics`; `chrome.tabs.onRemoved` → buffer cleanup
- [x] T017 [US2] Add the `getNetworkRequests` tool in src/agent/tools.ts: zod schema (`limit` 1–100, default 50) + definition per contracts/diagnostics-tools.md; execution identical consent gate as T012, then read from `src/agent/diagnostics.ts` for the conversation's active `tabId`

**Checkpoint**: US1 + US2 both functional; network diagnosis works with consent, metadata only

---

## Phase 5: User Story 3 - Consent and data discipline (Priority: P2)

**Goal**: Visible, distinct diagnostics consent UX; verified no-leak behavior; ACP parity

**Independent Test**: Fresh conversation → diagnostics tool attempt prompts; decline → no diagnostics in any model request; grant → works; new conversation → prompt returns (quickstart S1, S6)

### Tests for User Story 3 ⚠️

- [x] T018 [P] [US3] Extend tests/component/sidepanel.test.tsx: a `chat.error` with `message: "diagnostics_consent_required"` renders the diagnostics consent banner ("Allow page diagnostics"); clicking it posts a `diagnostics.consent { granted: true }` envelope; the screenshot banner is not shown (mirror the consent test at sidepanel.test.tsx:111-136)
- [x] T019 [P] [US3] Add failing flow test in tests/unit/chat-flow.test.ts: when a tool result carries `error: "diagnostics_consent_required"`, the background posts `chat.error` with message `diagnostics_consent_required` (local loop path; ACP path equivalent in tests/unit/acp-consent.test.ts style)

### Implementation for User Story 3

- [x] T020 [US3] Surface the signal in src/agent/chat-handler.ts: in both the local-loop `executeTool` callback and the ACP `setToolInvokeHandler` path, map tool results with `error === "diagnostics_consent_required"` to `chat.error { message: "diagnostics_consent_required", conversationId }` (alongside the existing screenshot handling)
- [x] T021 [US3] Add diagnostics consent state to src/ui/hooks/useSanchoRuntime.ts: `diagnosticsConsentRequired` set on the new `chat.error` message, `grantDiagnosticsConsent` posting `diagnostics.consent { granted: true }`; keep the screenshot consent state untouched
- [x] T022 [US3] Render the diagnostics banner in src/ui/components/chat.tsx (parallel to the screenshot banner, with text explaining that console messages and network URLs from the active tab will be shared with the model); add styles in src/ui/components/chat.css
- [x] T023 [P] [US3] Register `console_messages` and `network_requests` in native-host/com.sancho.mcp_server.mjs mapping to the same tool names, so ACP agents get parity through the same consent-gated path

**Checkpoint**: All three stories functional; consent UX verified in unit, component, and flow tests

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: End-to-end proof and gates

- [x] T024 Create tests/e2e/page-diagnostics.spec.ts modeled on tests/e2e/screenshot-consent.spec.ts: fixture page emitting a known console error and a failing fetch; mock SSE server issues `getConsoleMessages`/`getNetworkRequests` tool calls; verify consent prompt once, grant via `diagnostics.consent`, verify tool results reach the conversation, and verify no re-prompt within the conversation
- [x] T025 Run `pnpm exec vitest run --coverage` and confirm coverage stays ≥80% on src/agent, src/providers, src/storage
- [x] T026 [P] Run `pnpm lint` and `pnpm typecheck` and fix any findings
- [x] T027 Run `pnpm build && pnpm test:e2e` to confirm no regressions
- [ ] T028 Manual quickstart validation: execute specs/009-page-diagnostics-tools/quickstart.md S1–S9 in Brave/Chrome (S9 only if an ACP provider is configured)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies
- **Foundational (Phase 2)**: Depends on Phase 1 — BLOCKS all user stories (consent flag + bridge op)
- **US1 (Phase 3)**: Depends on Phase 2 (needs `diagnosticsConsent` for the gate)
- **US2 (Phase 4)**: Depends on Phase 2 only — file-disjoint from US1 except src/agent/tools.ts (sequence T012 → T017 if one implementer)
- **US3 (Phase 5)**: Depends on US1/US2 tool gating existing (needs `diagnostics_consent_required` results to surface)
- **Polish (Phase 6)**: After all stories

### User Story Dependencies

- **US1 (P1)**: Foundational only — MVP standalone
- **US2 (P2)**: Foundational only — independent of US1
- **US3 (P2)**: Needs at least one gated tool (US1) to be demonstrable; UI/plumbing shared by both tools

### Within Each User Story

- Tests written and failing before implementation
- Probe/buffer before tool registration before UI surfacing
- Story checkpoint validated before moving on

### Parallel Opportunities

- T003 ∥ T005 (different test files); T002 ∥ everything in Phase 2
- US1 tests T007 ∥ T008
- US1 impl: T009 (diag-probe.ts) ∥ T012-schema part — note T010/T011/T012 chain: probe registration (T011) and content handler (T010) are file-disjoint
- US2 tests T013 ∥ T014; US2 impl T015 → T016 → T017 sequential (same module chain)
- US3 tests T018 ∥ T019; T023 [P] against the UI tasks

---

## Parallel Example: User Story 1

```bash
# Launch US1 tests together:
Task: "Extend tests/unit/tools.test.ts with the two new tool names and getConsoleMessages schema tests"
Task: "Add failing getConsoleMessages consent/happy-path tests in tests/unit/agent-glue.test.ts"

# Then implementation (mostly file-disjoint):
Task: "Create entrypoints/diag-probe.ts MAIN-world probe"
Task: "Add console.read handler in entrypoints/content.ts"
Task: "Register the probe in entrypoints/background.ts"
Task: "Add getConsoleMessages tool in src/agent/tools.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1 + Phase 2 (permission + consent plumbing)
2. Complete Phase 3: US1 console tool
3. **STOP and VALIDATE**: quickstart S1–S3 — core diagnostic value delivered

### Incremental Delivery

1. Setup + Foundational → consent infrastructure ready
2. US1 → console diagnosis (MVP)
3. US2 → network outcomes
4. US3 → consent UX + ACP parity
5. Polish → e2e proof + gates + quickstart S1–S9

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Buffer caps are hard requirements from data-model.md: console **200 entries / 500 chars per entry**; network **100 entries / 300-char URLs**; tool read default **50**, max = buffer capacity
- Never collect request/response bodies or headers (spec FR-004)
- Diagnostics content is untrusted page data — pass to the model as data only (spec FR-007)
- Commit after each task or logical group; husky + lint-staged gates apply
