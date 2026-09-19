# Implementation Plan: Chat Session Management

**Branch**: `002-chat-session-management` | **Date**: 2026-09-19 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-chat-session-management/spec.md`

## Summary

Extend the existing single-conversation extension to multi-conversation chat session
management. Storage moves from one `conversation` record in `chrome.storage.local` to
a keyed collection (`conversation:<uuid>`) plus an index (`conversations.index`) and an
`activeConversationId` pointer, with one-time migration of the legacy record. The
background gains conversation CRUD handlers over the runtime port; `chat.send` carries
the active conversation id so runs append to the correct history. The side panel gains
a hamburger button and an in-panel conversations list view (sorted by `updatedAt`
descending) with select, new, delete, back button, and Esc dismissal. Conversation
titles derive from the first user message. ACP sessions bind per conversation.

## Technical Context

**Language/Version**: TypeScript 5.x, `strict: true`, `any` banned (unchanged)

**Primary Dependencies**: WXT (MV3), React 18+, `assistant-ui`, Vercel AI SDK v5,
`@agentclientprotocol/sdk` (unchanged — feature is internal to existing layers)

**Storage**: `chrome.storage.local` — new keys `conversation:<id>`,
`conversations.index`, `activeConversationId`; legacy `conversation` key migrated on
first run

**Testing**: Vitest + RTL (unit/component, ≥80% coverage gates on `src/agent`,
`src/providers`, `src/storage`); Playwright E2E for hamburger → list → select/new/delete
flows

**Target Platform**: Chrome/Chromium MV3 (unchanged)

**Project Type**: browser extension

**Performance Goals**: list render < 1s with 100 conversations (SC-001); conversation
switch renders full history < 1s (SC-002)

**Constraints**: MV3 CSP; no persistent in-memory state in service worker (index
rebuildable from storage); streaming runs must complete into their originating
conversation regardless of panel view state (FR-012)

**Scale/Scope**: single user, uncapped conversation count, 1 new UI view, ~4 new bridge
message types

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle                  | Gate                                                                                             | Status                                                                                                                |
| -------------------------- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| I. MV3 architecture        | Event-driven background; session state in `chrome.storage.local`; least-privilege content script | PASS — conversation store lives in local storage; list/switch handled as port messages; no new content-script surface |
| II. Unified provider layer | `BaseLLMProvider` abstraction; deterministic loop                                                | PASS — `chat.send` gains a `conversationId`; providers untouched except ACP session keying                            |
| III. ACP integration       | JSON-RPC via official SDK; authenticated local channel                                           | PASS — ACP `session/new` per conversation id; transport unchanged                                                     |
| IV. Automation security    | Unchanged tool surface                                                                           | PASS — no new page-access capabilities                                                                                |
| V. React UI sync           | UI mirrors service-worker state via runtime bridge                                               | PASS — list view state comes from `conversations.state` events; active conversation is background-owned               |
| VI. Hygiene & gates        | strict TS, ESLint+Prettier hooks, ≥80% coverage                                                  | PASS — same gates apply                                                                                               |

No violations → Complexity Tracking not required. Post-design re-check: PASS (unchanged).

## Project Structure

### Documentation (this feature)

```text
specs/002-chat-session-management/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   └── conversations.md # conversation bridge messages + storage keys
└── tasks.md             # Phase 2 output (/speckit.tasks - NOT created here)
```

### Source Code (repository root)

```text
src/
├── types.ts                        # Conversation gains title; ConversationSummary
├── storage/
│   └── conversations.ts            # NEW: multi-conversation store + migration (supersedes local.ts conversation fns)
├── agent/
│   └── chat-handler.ts             # chat.send/get/clear scoped by conversationId; new list/select/new/delete handlers
├── bridge/
│   └── messages.ts                 # NEW envelopes: conversations.list/select/new/delete, conversations.state
└── ui/
    ├── components/
    │   ├── chat.tsx                # top bar + hamburger button; hosts view switch
    │   └── conversation-list.tsx   # NEW: list view (entries, delete, new, back, Esc)
    └── hooks/
        └── useSanchoRuntime.ts     # active conversation from background; view switching

entrypoints/sidepanel/main.tsx      # unchanged bootstrap

tests/
├── unit/conversations.test.ts      # store CRUD, ordering, migration, title derivation
├── component/conversation-list.test.tsx  # list view interactions (select/new/delete/back/Esc)
└── e2e/conversations.spec.ts       # hamburger → list → select/new/delete in real browser
```

**Structure Decision**: Extends the existing WXT layout. Conversation storage is a new
module (`src/storage/conversations.ts`) so the legacy single-conversation helpers can be
removed after migration; UI adds one component and one hook change, keeping
assistant-ui runtime untouched.

## Artifacts

- [research.md](./research.md) — storage layout, migration, run-affinity, ACP session keying decisions
- [data-model.md](./data-model.md) — Conversation, ConversationSummary, index entities
- [contracts/conversations.md](./contracts/conversations.md) — new bridge messages and storage key contract
- [quickstart.md](./quickstart.md) — end-to-end validation scenarios
