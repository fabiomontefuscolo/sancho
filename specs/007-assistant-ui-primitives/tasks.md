# Tasks: Assistant-UI Primitives Alignment & Settings Polish

**Input**: Design documents from `/specs/007-assistant-ui-primitives/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/bridge-messages.md, quickstart.md

**Tests**: Included — the plan mandates updated component/e2e suites plus new unit tests (reasoning extraction, regenerate handler, threadList adapter). Write tests first and confirm they fail before implementing.

**Organization**: Tasks grouped by user story (US1–US7 from spec.md) for independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Dependency upgrade and compile-fix baseline; everything else builds on the installed 0.15.x types

- [x] T001 Bump `@assistant-ui/react` to `^0.15.21`, `@assistant-ui/react-markdown` to `^0.14.16`, `@assistant-ui/react-syntax-highlighter` to `^0.14.6` and add `lucide-react` in package.json, then `pnpm install`
- [x] T002 Fix 0.15 API/type drift so `pnpm typecheck` passes in src/ui/hooks/useSanchoRuntime.ts, src/ui/components/chat.tsx, src/ui/components/markdown-text.tsx, src/ui/components/code-block.tsx; while doing so verify the installed signatures of `MessagePrimitive.GroupedParts`, `groupPartByType`, `AuiIf`, `ActionBarPrimitive`, `ErrorPrimitive`, `ThreadListPrimitive`, and the runtime `threadList` adapter (research.md Decisions 2/7)

**Checkpoint**: Upgrade compiles; existing tests still pass (`pnpm exec vitest run`)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Bridge protocol + backend changes (contracts/bridge-messages.md) that the UI stories depend on

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T003 Extend the bridge protocol in src/bridge/messages.ts: `ChatDeltaPayload` gains `part?: "text" | "reasoning"` (absent = "text"); `ChatToolPayload` flattened to `{ toolCallId, toolName, argsText, result?, status, conversationId? }`; `ChatErrorPayload` gains `messageId?`; add `chat.regenerate` (payload `Record<string, never>`) to `UiToBackground`
- [x] T004 [P] Write failing unit tests for the `chat.regenerate` handler in tests/unit/chat-flow.test.ts: aborts active run, truncates assistant messages after the last user message, re-runs without appending a new user message, no-op when the conversation has no user message
- [x] T005 [P] Write failing unit tests for reasoning extraction in tests/unit/openai-compatible.test.ts: `reasoning-delta` stream parts invoke `onReasoningDelta`; text deltas still invoke `onDelta`; providers without reasoning never call it
- [x] T006 Add optional `onReasoningDelta` to `StreamEvents` in src/providers/base.ts and extract `reasoning-delta` parts from the AI SDK `fullStream` in src/providers/openai-compatible.ts (makes T005 pass)
- [x] T007 Refactor src/agent/chat-handler.ts: extract the run path into a shared `runConversation(conversation, tabId, port)` helper; emit `chat.delta` with `part` (reasoning via `onReasoningDelta`), emit flattened `chat.tool` with `toolCallId` (provider `toolCallId`, generated UUID in the ACP path), `argsText` (serialized args), `result` on finished, and include `messageId` (assistant id) on every `chat.error` (consent_required path unchanged)
- [x] T008 Implement `handleChatRegenerate` in src/agent/chat-handler.ts (abort run → truncate after last user message → save → `runConversation`) and register it in entrypoints/background.ts (makes T004 pass)

**Checkpoint**: Protocol contract complete; `pnpm exec vitest run` green including T004/T005

---

## Phase 3: User Story 1 - Modern composer with run control (Priority: P1) 🎯 MVP

**Goal**: ChatGPT-style rounded composer with auto-growing input and a stop button while running

**Independent Test**: Type a multi-line message, send with Enter, stop a mid-run agent; quickstart.md S1

- [x] T009 [US1] Write failing component tests in tests/component/sidepanel.test.tsx: send disabled when empty, Enter sends / Shift+Enter newline, stop button visible while running and clicking it posts `chat.cancel`, composer returns to idle on `chat.done`
- [x] T010 [US1] Wire `onCancel` to the existing `chat.cancel` bridge op in the `useExternalStoreRuntime` options in src/ui/hooks/useSanchoRuntime.ts
- [x] T011 [US1] Restyle the composer in src/ui/components/chat.tsx and src/ui/components/chat.css: rounded card container, `ComposerPrimitive.Input` with `rows={1}` auto-grow, circular icon send button (lucide-react), stop-vs-send rendered via running state/`AuiIf`

**Checkpoint**: US1 independently functional and testable

---

## Phase 4: User Story 2 - Thought process display (Priority: P1)

**Goal**: Collapsible in-message "Thought process" group with reasoning + tool invocations, replacing the detached activity strip; live-only, never persisted

**Independent Test**: Send a tool-triggering prompt; tool entries appear inside the assistant message with running→done states; quickstart.md S2

- [x] T012 [US2] Write failing component tests in tests/component/sidepanel.test.tsx: reasoning deltas render inside the collapsible group, tool entries show name + running/done status, no empty reasoning block when the model emits none, interrupted tool entries render terminal on `chat.done`/`chat.error`, group absent after conversation reload
- [x] T013 [US2] Rework streaming state in src/ui/hooks/useSanchoRuntime.ts: assistant content built as ordered parts (`reasoning` | `tool-call` | `text`) from `chat.delta` `part` and flattened `chat.tool` events; mark tool parts terminal on done/error/cancel
- [x] T014 [US2] Render `MessagePrimitive.GroupedParts` + `groupPartByType` with a hand-rolled "Thought process" accordion in `AssistantMessage` in src/ui/components/chat.tsx (final text always visible; group collapsible)
- [x] T015 [US2] Remove the tool-activity strip and `toolActivity` plumbing from src/ui/components/chat.tsx and src/ui/hooks/useSanchoRuntime.ts; keep the `agentState` status line; adjust src/ui/components/chat.css

**Checkpoint**: US1+US2 functional independently

---

## Phase 5: User Story 3 - Message action bar (Priority: P2)

**Goal**: Per-message action bar with copy (all messages) and regenerate (assistant messages), auto-hiding and hidden during runs

**Independent Test**: Hover messages, copy raw markdown, regenerate an assistant reply; quickstart.md S3

- [x] T016 [US3] Write failing component tests in tests/component/copy-controls.test.tsx: copy places raw markdown on clipboard with transient confirmation, reload visible only on assistant messages, bar hidden while running, auto-hide on non-last messages
- [x] T017 [US3] Add `ActionBarPrimitive.Root hideWhenRunning autohide="not-last" autohideFloat="always"` with Copy to both message components and Reload (wired to `chat.regenerate` via a new `onReload` in src/ui/hooks/useSanchoRuntime.ts) to assistant messages in src/ui/components/chat.tsx
- [x] T018 [US3] Remove `RawTextContext`, `MessageCopyButton`, `getMessageRawText` and `rawTextRef` from src/ui/components/chat.tsx and src/ui/hooks/useSanchoRuntime.ts; delete src/ui/components/copy-button.tsx if no remaining usage

**Checkpoint**: US3 functional; regenerate works end-to-end against the Phase 2 backend

---

## Phase 6: User Story 4 - Accessible error display (Priority: P2)

**Goal**: Run failures shown as an alert-role error notice on the failed message; never injected as assistant text

**Independent Test**: Force a provider failure; error notice appears with alert role; consent banner unaffected; quickstart.md S4

- [x] T019 [US4] Write failing component tests in tests/component/sidepanel.test.tsx: `chat.error` sets message status (no `Error: ` text part), notice rendered with `role="alert"`, `consent_required` still shows the banner, pre-content errors attach to the placeholder assistant message
- [x] T020 [US4] Set in-flight assistant message `status = { type: "incomplete", reason: "error", error }` on `chat.error` (targeting payload `messageId`, fallback to in-flight message) in src/ui/hooks/useSanchoRuntime.ts, and render `ErrorPrimitive.Root role="alert"` + `ErrorPrimitive.Message` in `AssistantMessage` in src/ui/components/chat.tsx

**Checkpoint**: US4 functional; no fake error text anywhere in the thread

---

## Phase 7: User Story 5 - Conversation list via standard thread list (Priority: P2)

**Goal**: List/create/switch/delete conversations via ThreadList primitives with active-conversation marking

**Independent Test**: Open list, create/switch/delete conversations; quickstart.md S5

- [ ] T021 [US5] Write failing tests: adapter mapping unit tests in tests/unit/threadlist-adapter.test.ts (threads/activeThreadId/switch/delete/new mapped from `conversations.state`) and component tests in tests/component/conversation-list.test.tsx (list renders with active marked, create/switch/delete flows)
- [ ] T022 [US5] Add the `threadList` adapter to `useExternalStoreRuntime` in src/ui/hooks/useSanchoRuntime.ts, mapping `conversations.state` → `{ threads, onSwitchToNewThread → conversations.new, onSwitchToThread → conversations.select, onDelete → conversations.delete }` (no archive/rename)
- [ ] T023 [US5] Rewrite src/ui/components/conversation-list.tsx with `ThreadListPrimitive.Root/New/Items` + `ThreadListItemPrimitive.Trigger/Title/Delete`, keeping the hamburger view-swap UX in src/ui/components/chat.tsx

**Checkpoint**: US5 functional; conversation management fully standardized

---

## Phase 8: User Story 6 - Settings access & appearance section (Priority: P3)

**Goal**: Options page gains a top-level Appearance section (`#appearance` nav anchor); panel gear opens the options page; separate "Aa" quick view retained

**Independent Test**: Click gear → options page opens with Appearance in nav; quickstart.md S6

- [ ] T024 [US6] Write failing component tests in tests/component/options.test.tsx: nav order `Connection | Appearance | Actions | About`, `#appearance` anchor, font-size select lives in Appearance only
- [ ] T025 [US6] Promote Appearance to a top-level section with the font-size select and `#appearance` nav anchor in src/ui/components/settings-panel.tsx and entrypoints/options/main.tsx
- [ ] T026 [US6] In src/ui/components/chat.tsx: gear button calls `chrome.runtime.openOptionsPage()`; add a separate "Aa" button that opens the existing in-panel font-size quick view (src/ui/components/settings-view.tsx unchanged in behavior)

**Checkpoint**: US6 functional; both font-size surfaces stay in sync (FR-013)

---

## Phase 9: User Story 7 - Thread polish (Priority: P3)

**Goal**: Floating scroll-to-bottom button and a welcoming empty state

**Independent Test**: Scroll up in a long conversation and use the button; new conversation shows welcome state; quickstart.md S7

- [ ] T027 [US7] Add `ThreadPrimitive.ScrollToBottom` floating button and restyle `ThreadPrimitive.Empty` welcome state in src/ui/components/chat.tsx and src/ui/components/chat.css

**Checkpoint**: All seven stories independently functional

---

## Phase 10: Polish & Cross-Cutting Concerns

**Purpose**: E2E alignment, full gates, manual validation

- [ ] T028 Update e2e suites in tests/e2e/: conversations.spec.ts (ThreadList), rich-messages.spec.ts (action bar/error notice), agent-loop.spec.ts (thought-process group + regenerate scenario), layout.spec.ts (composer/scroll-to-bottom)
- [ ] T029 Run full gates: `pnpm exec vitest run` (coverage ≥80% on src/agent|src/providers|src/storage), `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm test:e2e`
- [ ] T030 Manual Brave validation of quickstart.md scenarios S1–S7 (extension id `jmpiiajepljjaimgdjmfdjiahhaajfma`) — user performs; leave unchecked

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on T001/T002 — BLOCKS all user stories
- **User Stories (Phases 3–9)**: All depend on Foundational completion; US1→US2 are P1 and sequential; P2/P3 stories may proceed in priority order or in parallel by separate files
- **Polish (Phase 10)**: Depends on all stories complete

### User Story Dependencies

- **US1 (P1)**: After Phase 2 — no story dependencies
- **US2 (P1)**: After Phase 2 — shares useSanchoRuntime.ts/chat.tsx with US1; run sequentially after US1 to avoid conflicts
- **US3 (P2)**: After Phase 2 — depends on `chat.regenerate` (T008); shares chat.tsx with US1/US2 — sequential
- **US4 (P2)**: After Phase 2 — shares useSanchoRuntime.ts/chat.tsx — sequential
- **US5 (P2)**: After Phase 2 — mostly conversation-list.tsx + adapter; can parallel with US3/US4 except useSanchoRuntime.ts touchpoints
- **US6 (P3)**: After Phase 2 — options files + chat.tsx top bar; sequential after other chat.tsx work
- **US7 (P3)**: After Phase 2 — chat.tsx/chat.css only; sequential after other chat.tsx work

### Parallel Opportunities

- T004 and T005 (different test files) in parallel
- T021's unit test (tests/unit/threadlist-adapter.test.ts) in parallel with US3/US4 component tests (different files)
- Within each story, test task precedes implementation tasks

## Parallel Example: User Story 2

```bash
# After foundational phase, run in parallel:
Task: "Unit tests for threadlist adapter in tests/unit/threadlist-adapter.test.ts"  # US5 prep
Task: "Component tests for thought-process accordion in tests/component/sidepanel.test.tsx"  # US2
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1: Setup (T001–T002)
2. Phase 2: Foundational (T003–T008)
3. Phase 3: US1 composer + stop (T009–T011)
4. **STOP and VALIDATE**: quickstart S1

### Incremental Delivery

1. Setup + Foundational → protocol/backend ready
2. US1 → US2 (P1 pair) → validate S1+S2
3. US3 → US4 → US5 (P2) → validate S3–S5
4. US6 → US7 (P3) → validate S6–S7
5. Phase 10 gates + manual quickstart

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to spec.md user story
- Tests written first and confirmed failing before implementation
- Commit after each task or logical group
- Most UI stories share chat.tsx / useSanchoRuntime.ts — sequence them within a single worker to avoid conflicts
