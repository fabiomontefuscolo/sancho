# Tasks: Chat Session Management

**Feature**: `002-chat-session-management` | **Plan**: [plan.md](./plan.md) | **Spec**: [spec.md](./spec.md)

Tests are included: the project constitution (Article VI) requires ≥80% coverage gates on
`src/agent`, `src/providers`, `src/storage`, and the quickstart defines the suites.

## Phase 1: Setup

- [ ] T001 Extend `Conversation` in `src/types.ts` with `title: string` and `acpSessionId: string | null`; add `ConversationSummary` interface with fields `id: string`, `title: string`, `updatedAt: number`, `createdAt: number`, `messageCount: number` per `data-model.md`

## Phase 2: Foundational (blocking prerequisites)

- [ ] T002 Create multi-conversation store in `src/storage/conversations.ts`: records at `conversation:<uuid>` (id via `crypto.randomUUID()`), index at `conversations.index` (array of `ConversationSummary`), pointer at `activeConversationId`; functions `listConversations()` (sorted by `updatedAt` descending, computed at read time), `getConversation(id)`, `getActiveConversation()`, `createConversation()` (sets active, title `"New conversation"`), `saveConversationRecord(conversation)` (bumps `updatedAt = Date.now()`, updates index entry incl. `messageCount`), `deleteConversation(id)`, `setActiveConversation(id)`
- [ ] T003 Implement title derivation in `src/storage/conversations.ts`: first user message text, whitespace collapsed, truncated to 40 characters with ellipsis; fallback `"New conversation"` when no user message; recompute at index-update time after the first user message is persisted (FR-009)
- [ ] T004 Implement one-time idempotent migration in `src/storage/conversations.ts`: on first call, if legacy key `conversation` exists and `conversations.index` does not, wrap it as `conversation:<uuid>` (preserve `messages`, `screenshotConsent`, `createdAt`, `updatedAt`), derive title, seed index + `activeConversationId`, remove legacy key; guard on index existence
- [ ] T005 Unit tests for the store in `tests/unit/conversations.test.ts`: CRUD, ordering by `updatedAt` desc, title derivation (truncation at 40 chars, ellipsis, placeholder), migration (data preserved, legacy key removed, idempotent on second run), invariant `updatedAt >= createdAt`, index/record consistency
- [ ] T006 Amend envelopes in `src/bridge/messages.ts`: new UI→background `conversations.list {}`, `conversations.select { conversationId }`, `conversations.new {}`, `conversations.delete { conversationId }`; amend `chat.send` payload to require `conversationId: string`; amend `conversation.get` payload to `{ conversationId?: string }`; new background→UI `conversations.state { conversations: ConversationSummary[]; activeConversationId: string }`; add `conversationId` and `title` to `conversation.state` payload; add `conversationId` to `chat.delta`/`chat.done`/`chat.error` payloads — per `contracts/conversations.md`

## Phase 3: User Story 1 — Switch Between Conversations (P1)

**Goal**: Hamburger opens list sorted by recency; clicking an entry selects it, closes
list, shows its history; resumed conversation accepts new messages.

**Independent test**: create two conversations, open list, select older one, verify
history renders and new messages append to it.

- [ ] T007 [US1] Background handlers in `src/agent/chat-handler.ts`: register `conversations.list` (emit `conversations.state`) and `conversations.select` (set active id; emit `conversations.state` + `conversation.state` for target; unknown id → `chat.error` with `message: "unknown conversation"`, active unchanged); register both in `entrypoints/background.ts`
- [ ] T008 [US1] Scope chat flow by conversation in `src/agent/chat-handler.ts`: `handleChatSend` loads/saves the conversation record for `payload.conversationId` (not the legacy single record), emits `conversationId` on all run events, and persists each appended message via `saveConversationRecord` so runs complete into the originating conversation even if the panel switches away (FR-012); `handleConversationGet` honors optional `conversationId`
- [ ] T009 [P] [US1] Update `useSanchoRuntime` in `src/ui/hooks/useSanchoRuntime.ts`: track active `conversationId` from `conversation.state`/`conversations.state`; ignore run events whose `conversationId` does not match the active one; send `conversationId` in `chat.send`; on active-conversation change, request `conversation.get` and replace rendered history from persisted state
- [ ] T010 [US1] Create conversations list view in `src/ui/components/conversation-list.tsx`: renders `ConversationSummary[]` in received order, each entry showing title; clicking an entry emits `conversations.select` and switches panel view back to chat
- [ ] T011 [US1] Add top bar with hamburger icon button (top-left) in `src/ui/components/chat.tsx`; local view state `chat | list`; hamburger emits `conversations.list` and shows `ConversationList`; successful select returns to chat view
- [ ] T012 [P] [US1] Component tests in `tests/component/conversation-list.test.tsx`: hamburger opens list with entries in order; entry click sends `conversations.select` and closes list; history renders from `conversation.state`
- [ ] T013 [US1] Unit tests for scoped chat flow in `tests/unit/chat-handler.test.ts`: send targets the given conversation id only; run events carry `conversationId`; selecting unknown id yields `chat.error` "unknown conversation"

## Phase 4: User Story 2 — Start a New Conversation (P2)

**Goal**: From the list view, start a new empty conversation; list closes, chat view is
empty; old conversations remain intact.

**Independent test**: open list, start new conversation, verify empty chat; reopen list
and verify prior conversation still listed with history.

- [ ] T014 [US2] Background handler `conversations.new` in `src/agent/chat-handler.ts` (registered in `entrypoints/background.ts`): `createConversation()`, emit `conversations.state` + empty `conversation.state`
- [ ] T015 [US2] Add "New conversation" affordance at the top of the list view in `src/ui/components/conversation-list.tsx`: emits `conversations.new`, returns to chat view on the resulting `conversation.state`
- [ ] T016 [P] [US2] Component test in `tests/component/conversation-list.test.tsx`: new-conversation click sends `conversations.new`; on empty `conversation.state` the chat view shows no messages; prior entries still listed

## Phase 5: User Story 3 — Dismiss the List Without Switching (P3)

**Goal**: Back button or Esc closes the list with zero side effects.

**Independent test**: open list from an active conversation, press Esc, verify same
conversation and unchanged list.

- [ ] T017 [US3] Back button (top-left of list view) in `src/ui/components/conversation-list.tsx`: switches panel view to chat without emitting any message
- [ ] T018 [US3] Esc key dismissal in `src/ui/components/conversation-list.tsx`: `keydown` listener (attached while list view is mounted) on `Escape` switches to chat view without emitting any message
- [ ] T019 [P] [US3] Component tests in `tests/component/conversation-list.test.tsx`: back button and Esc each close the list; assert no `conversations.select`/`new`/`delete` message was sent and rendered conversation unchanged

## Phase 6: User Story 4 — Delete a Conversation (P4)

**Goal**: Per-entry delete button removes the conversation permanently; deleting the
active one lands the user in a fresh empty conversation.

**Independent test**: delete active → empty chat; delete non-active → active unchanged;
restart → deleted stays gone.

- [ ] T020 [US4] Background handler `conversations.delete` in `src/agent/chat-handler.ts` (registered in `entrypoints/background.ts`): cancel in-flight run bound to that id (existing abort path), remove record + index entry; if active, `createConversation()` and emit empty `conversation.state`; always emit `conversations.state`
- [ ] T021 [US4] Delete button on each entry in `src/ui/components/conversation-list.tsx`: emits `conversations.delete { conversationId }`; list refreshes from pushed `conversations.state` (no confirmation dialog, single-click per spec assumption)
- [ ] T022 [US4] Redefine `chat.clear` in `src/agent/chat-handler.ts` as delete-active-and-create-fresh (equivalent to `conversations.delete` on the active id) per `contracts/conversations.md`
- [ ] T023 [P] [US4] Unit tests in `tests/unit/conversations.test.ts`: delete removes record + index entry; deleting active creates fresh empty active conversation; deleting last conversation behaves as delete-active; deleted id never reappears after simulated restart (SC-004)
- [ ] T024 [P] [US4] Component tests in `tests/component/conversation-list.test.tsx`: delete button sends `conversations.delete` with correct id; entry disappears on `conversations.state`

## Phase 7: Polish & Cross-Cutting

- [ ] T025 Remove legacy single-conversation helpers (`getConversation`, `saveConversation`, `clearConversation`, `emptyConversation`) from `src/storage/local.ts` and migrate all callers to `src/storage/conversations.ts`; keep API-key and agent-session helpers
- [ ] T026 ACP session binding per research decision 5 in `src/providers/acp.ts` + `src/agent/chat-handler.ts`: `session/new` keyed by conversation id; persist `acpSessionId` on the conversation record; resuming reuses the stored session; new conversation starts a new session
- [ ] T027 E2E test in `tests/e2e/conversations.spec.ts` per `quickstart.md`: two conversations via chat sends; hamburger opens list with recency order and derived titles; select older renders its history; delete active yields empty chat; fresh browser context confirms persistence (SC-003) and deleted-id absence (SC-004)
- [ ] T028 Push `conversations.state` after any message append that changes ordering or title in `src/agent/chat-handler.ts` (contract invariant: list always current)
- [ ] T029 Validate gates: `pnpm exec vitest run --coverage` (≥80% statements/branches on `src/agent`, `src/providers`, `src/storage`), `pnpm lint`, `pnpm typecheck`, `pnpm build`

## Dependencies

- Phase 2 (T002–T006) blocks all story phases.
- US1 (T007–T013) is the MVP; US2 depends on the list view from US1; US3 and US4 depend
  on the list view but are independent of each other; Polish last.

## Parallel Opportunities

- Within US1: T009 (UI hook) and T012 (component tests) can proceed once T006 exists,
  in parallel with T007/T008 (background).
- T016, T019, T023/T024 are parallel test tasks within their stories.
- T025 and T026 are parallel polish tasks on different files.

## Implementation Strategy

MVP = Phases 1–3 (switch between conversations working end to end). Then deliver
US2 → US3 → US4 as independent increments, each commit-ready, finishing with Polish.
