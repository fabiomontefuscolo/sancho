---
description: "Task list for Custom Instructions (008)"
---

# Tasks: Custom Instructions

**Input**: Design documents from `/specs/008-custom-instructions/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/request-prelude.md

**Tests**: Included — the project constitution mandates unit/component tests with ≥80% coverage on `src/agent`, `src/providers`, `src/storage`. Write tests FIRST and watch them fail before implementing.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- Single-project extension: `src/`, `entrypoints/`, `tests/` at repository root

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Baseline verification — no new dependencies or scaffolding needed

- [x] T001 Run `pnpm exec vitest run && pnpm lint && pnpm typecheck` to confirm a green baseline before changes

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The `customInstructions` storage module — every story reads or writes through it

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T002 [P] Add failing storage unit tests in tests/unit/storage.test.ts: default is `""` when unset, round-trip save/get, non-string value normalizes to `""`, strings longer than 4,000 chars truncate to 4,000 on read, `saveCustomInstructions` trims and clamps to 4,000 chars, `onCustomInstructionsChanged` fires with normalized value
- [x] T003 Implement the `customInstructions` key in src/storage/settings.ts following the `uiPrefs` pattern: `export const MAX_CUSTOM_INSTRUCTIONS = 4000`, `normalizeCustomInstructions(raw: unknown): string` (non-string → `""`, overlong → `slice(0, 4000)`), `getCustomInstructions()`, `saveCustomInstructions(text)` (trim + clamp before write), `onCustomInstructionsChanged(listener)` mirroring `onUiPrefsChanged`

**Checkpoint**: Storage tests pass; `getCustomInstructions()` usable from agent and UI code

---

## Phase 3: User Story 1 - Define how the agent replies in every chat (Priority: P1) 🎯 MVP

**Goal**: User sets instructions on the options page; every chat request (built-in, Copilot, ACP) carries them as leading instruction context

**Independent Test**: Set instructions to "Always reply in exactly one sentence.", send any chat message, verify the reply reflects the instruction (quickstart S1, S2)

### Tests for User Story 1 ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [x] T004 [P] [US1] Add failing chat-flow tests in tests/unit/chat-flow.test.ts next to the clock-message test: (a) when instructions are set, `received[0].role === "system"` and content starts with `Custom instructions from the user (follow these in every reply):`, with the clock message at index 1; (b) when instructions are empty/whitespace, no extra system message is added (clock message stays at index 0, byte-identical prelude to pre-feature behavior)
- [x] T005 [P] [US1] Add failing ACP preamble test in tests/unit/acp-session-retry.test.ts: prompt text includes `User's custom instructions: <text>` when instructions are set, and omits it when empty
- [x] T006 [P] [US1] Add failing component test tests/component/custom-instructions-section.test.tsx (model on tests/component/appearance-section.test.tsx): renders heading "Custom instructions", hint text mentioning AGENTS.md, textarea with `maxLength={4000}`, counter `0 / 4000`; typing updates the counter and persists via `saveCustomInstructions`
- [x] T007 [P] [US1] Update tests/component/options.test.tsx: assert the options nav contains a link to `#instructions` labeled "Custom instructions" between Appearance and Actions

### Implementation for User Story 1

- [x] T008 [US1] Inject instructions in `buildProviderMessages` in src/agent/chat-handler.ts: read `getCustomInstructions()` per call; when non-empty/non-whitespace prepend `{ role: "system", content: "Custom instructions from the user (follow these in every reply):\n" + instructions }` at index 0, before `systemClockMessage(title, url)`; never write instructions into `conversation.messages`
- [x] T009 [P] [US1] Extend the ACP preamble in src/providers/acp.ts (`streamChat`, around the `preamble` construction at lines 264-269): when `getCustomInstructions()` returns non-empty, append `User's custom instructions: ${instructions}` to the preamble so it applies on both fresh prompts and context-rebuild retries
- [x] T010 [P] [US1] Create src/ui/components/custom-instructions-section.tsx modeled on src/ui/components/appearance-section.tsx: `<section aria-label="Custom instructions" className="options-section">` with `<h2>Custom instructions</h2>`, hint text "Instructions the agent follows in every chat, like an AGENTS.md file.", `<textarea maxLength={MAX_CUSTOM_INSTRUCTIONS}>` wired to `getCustomInstructions`/`saveCustomInstructions`/`onCustomInstructionsChanged`, and a live `{length} / 4000` counter (save-on-change is acceptable here; debounce arrives in US2)
- [x] T011 [US1] Mount the new section in entrypoints/options/main.tsx: add `<a href="#instructions">Custom instructions</a>` to the nav between Appearance and Actions, and `<div id="instructions"><CustomInstructionsSection /></div>` between the appearance and actions divs

**Checkpoint**: US1 independently functional — instructions set on options page visibly shape built-in, Copilot, and ACP chat replies

---

## Phase 4: User Story 2 - Update or remove instructions at any time (Priority: P2)

**Goal**: Edits and clears take effect on the next chat message; typing never hits sync-storage write quotas; persistence survives browser restart

**Independent Test**: Mid-conversation, change "reply in Portuguese" to "reply in English", send next message in the same conversation and verify the switch; then clear and verify default behavior returns (quickstart S3, S4, S7)

### Tests for User Story 2 ⚠️

- [x] T012 [P] [US2] Add failing chat-flow test in tests/unit/chat-flow.test.ts: with instructions "A" used on turn 1, save instructions "B", then verify turn 2's request carries "B" (proves per-run re-read, no caching)
- [x] T013 [P] [US2] Extend tests/component/custom-instructions-section.test.tsx: edits within the debounce window produce exactly one `chrome.storage.sync` write; blur triggers an immediate save; a "Saved" indicator appears after a successful write; clearing the textarea persists `""`

### Implementation for User Story 2

- [x] T014 [US2] Add debounced save to src/ui/components/custom-instructions-section.tsx: write ~600 ms after the last keystroke, save immediately on blur (cancelling the pending debounce), show a transient "Saved" indicator after each successful write; clean up timers on unmount

**Checkpoint**: US1 + US2 both functional — live editing mid-chat works and saves are quota-safe

---

## Phase 5: User Story 3 - Instructions follow the user across devices (Priority: P3)

**Goal**: Instructions sync across browser profiles via the same settings sync mechanism as other preferences

**Independent Test**: Save instructions on one synced profile and verify presence + effect on a second profile (manual; quickstart S7 covers persistence, sync relies on the `chrome.storage.sync` choice made in Phase 2)

- [x] T015 [US3] Verify no local-area leakage: confirm via tests/unit/storage.test.ts assertions that all `customInstructions` access goes through `chrome.storage.sync` (guarded by the T002 tests) and manually smoke-test persistence across a browser restart per quickstart S7

**Checkpoint**: All three user stories functional

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Gates and final validation

- [x] T016 Run `pnpm exec vitest run` and confirm coverage stays ≥80% on src/agent, src/providers, src/storage
- [x] T017 [P] Run `pnpm lint` and `pnpm typecheck` and fix any findings
- [x] T018 Run `pnpm build && pnpm test:e2e` to confirm no e2e regressions
- [ ] T019 Manual quickstart validation: execute specs/008-custom-instructions/quickstart.md S1–S8 in Brave/Chrome (S8 only if an ACP provider is configured)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies
- **Foundational (Phase 2)**: Depends on Phase 1 — BLOCKS all user stories
- **US1 (Phase 3)**: Depends on Phase 2 (needs `getCustomInstructions` in agent + UI)
- **US2 (Phase 4)**: Depends on Phase 3 component existing (extends the same file) — testable on its own criteria once present
- **US3 (Phase 5)**: Verification only; can run any time after Phase 2
- **Polish (Phase 6)**: After all desired stories

### User Story Dependencies

- **US1 (P1)**: Storage module only — no other story
- **US2 (P2)**: Extends the US1 component file (`custom-instructions-section.tsx`); injection-side live pickup is already guaranteed by the per-run read in T008
- **US3 (P3)**: No code beyond Phase 2's sync-area choice; pure verification

### Within Each User Story

- Tests written and failing before implementation
- Storage before injection before UI mounting
- Story checkpoint validated before moving on

### Parallel Opportunities

- T002 ∥ nothing (same file as T003; strictly sequential within Phase 2)
- US1 tests T004, T005, T006, T007 all parallel (four different test files)
- US1 impl: T009 (acp.ts) ∥ T010 (new component) — T008 (chat-handler.ts) and T011 (main.tsx) also touch distinct files, so all four implementation tasks are file-disjoint and parallelizable
- US2 tests T012 ∥ T013

---

## Parallel Example: User Story 1

```bash
# Launch all US1 tests together:
Task: "Add failing chat-flow tests in tests/unit/chat-flow.test.ts"
Task: "Add failing ACP preamble test in tests/unit/acp.test.ts"
Task: "Add failing component test tests/component/custom-instructions-section.test.tsx"
Task: "Update tests/component/options.test.tsx"

# Then implementation tasks (all file-disjoint):
Task: "Inject instructions in buildProviderMessages in src/agent/chat-handler.ts"
Task: "Extend the ACP preamble in src/providers/acp.ts"
Task: "Create src/ui/components/custom-instructions-section.tsx"
Task: "Mount the new section in entrypoints/options/main.tsx"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1 (baseline) and Phase 2 (storage)
2. Complete Phase 3: US1
3. **STOP and VALIDATE**: quickstart S1–S2 — the feature already delivers its core value

### Incremental Delivery

1. Setup + Foundational → storage ready
2. US1 → instructions shape every chat (MVP)
3. US2 → live edit/clear with quota-safe saving
4. US3 → sync verification (no code)
5. Polish gates → quickstart S1–S8

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- The 4,000-char cap (`MAX_CUSTOM_INSTRUCTIONS`) is a hard constraint from the sync-storage ~8 KB/item quota — do not raise it without re-checking quota math (see research.md R3)
- Selection Actions path (src/agent/actions.ts) is deliberately untouched (FR-008)
- Commit after each task or logical group; husky + lint-staged gates apply
