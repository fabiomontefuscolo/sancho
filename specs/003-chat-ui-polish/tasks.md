# Tasks: Chat UI Polish

**Input**: Design documents from `/specs/003-chat-ui-polish/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/ui-contract.md

**Tests**: Included (constitution VI — Test-First Quality; plan lists component + e2e tests).

**Organization**: Tasks grouped by user story; US1 and US4 are both P1 but touch the same stylesheet — US4 after US1 to avoid conflicts.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1–US4)
- Exact file paths in descriptions

## Path Conventions

- UI components: `src/ui/components/`
- UI utils: `src/ui/utils/`
- Component tests: `tests/component/`
- E2E tests: `tests/e2e/`

---

## Phase 1: Setup

**Purpose**: Shared formatting utility used by US3; no other setup needed (existing project).

- [ ] T001 Create `src/ui/utils/format-time.ts` exporting `formatMessageTime(epochMs: number): string` that formats with `Intl.DateTimeFormat` (user locale, weekday `short`, month `short`, day `numeric`, hour `2-digit`, minute `2-digit`, `hour12: false`) so 1758317760000-style epochs render like `Sat Sep 19 22:56`; do NOT reuse `src/agent/time.ts#formatTimestamp` (plan decision 4 — bracketed agent-context format)

---

## Phase 2: Foundational

**Purpose**: None — every story is independently implementable against existing primitives (plan: no foundational/blocking work).

_(No tasks.)_

---

## Phase 3: User Story 1 — Chat fills the sidebar with a single scrollbar (Priority: P1) 🎯 MVP

**Goal**: Sidebar views occupy the full panel width; exactly one vertical scroll region (the message viewport); outer view never scrolls (FR-001, FR-002; contract invariants 1–3).

**Independent Test**: Open list and chat views — no side margins; long conversation scrolls only in the message history; top bar and composer fixed; no horizontal scrollbar at minimum panel width.

### Tests for User Story 1

- [ ] T002 [US1] Add e2e layout spec `tests/e2e/layout.spec.ts`: open the side panel, send a message via the mock provider, then assert (a) `document.body.scrollWidth === document.body.clientWidth` and `document.documentElement.scrollHeight <= document.documentElement.clientHeight + 1` (no outer scrollbars), (b) the thread viewport element has `scrollHeight > clientHeight` only after enough messages, and (c) computed `margin` on `body` is `0px`

### Implementation for User Story 1

- [ ] T003 [US1] In `src/ui/components/chat.css` add a root reset — `html, body, #root { margin: 0; height: 100%; overflow: hidden; }` — and ensure `.sancho-chat-root` keeps `height: 100vh` with the flex chain `.sancho-thread { min-height: 0 }` and `.sancho-viewport { flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden; }` so the viewport is the sole scroll region (research R2)
- [ ] T004 [P] [US1] Remove dead side margins/padding in `src/ui/components/chat.css` and the conversation-list styles (`src/ui/components/conversation-list.tsx` classNames/CSS): header/topbar, consent banner, activity strip, composer, and list rows span 100% width; keep inner content padding only inside bubbles/rows (FR-001, research R5)

**Checkpoint**: US1 testable — full-width views, single scrollbar.

---

## Phase 4: User Story 4 — Wide content never scrolls the whole list (Priority: P1)

**Goal**: Images fit message width; `pre` scrolls inside the bubble; long unbroken strings wrap; list never scrolls horizontally (FR-006..FR-009; contract invariants 8–11).

**Independent Test**: Message with a wide image and a message with a 200-char code line: list `scrollWidth === clientWidth` throughout; image visually fits; code block scrolls internally.

### Tests for User Story 4

- [ ] T005 [US4] Extend `tests/e2e/layout.spec.ts`: mock an assistant message containing an image part and a message containing a fenced code block with a 200-character line; assert the viewport/list element keeps `scrollWidth === clientWidth`, the rendered `img` `getBoundingClientRect().width <=` message width, and the `pre` element itself has `scrollWidth > clientWidth` with `overflow-x` computed `auto` (contract invariants 8–11)

### Implementation for User Story 4

- [ ] T006 [US4] In `src/ui/components/chat.css` add containment rules: `.sancho-message { min-width: 0; max-width: 100%; }` (replacing the 85% cap with `max-width: 85%` kept but bounded by `100%` of the viewport — verify computed behavior in e2e), `.sancho-message img { max-width: 100%; height: auto; display: block; }`, `.sancho-message pre { max-width: 100%; overflow-x: auto; }`, and `overflow-wrap: anywhere` on message text so URLs/tokens wrap (research R3; rules must hold without a markdown renderer)

**Checkpoint**: US4 testable — list horizontally static for any content.

---

## Phase 5: User Story 3 — Messages show when they were sent (Priority: P2)

**Goal**: Every user/assistant message with a recorded time shows `Sat Sep 19 22:56`-style timestamp; legacy records without `createdAt` show nothing (FR-004, FR-005; contract invariants 5–7).

**Independent Test**: Send a message, receive a reply — both show timestamps; reload the conversation — original times; a message object lacking `createdAt` renders no label.

### Tests for User Story 3

- [ ] T007 [US3] Add component test `tests/component/chat-timestamp.test.tsx`: render the chat with (a) user + assistant messages with known `createdAt` and assert both timestamp labels match the `Sat Sep 19 22:56` shape (`/\w{3} \w{3} \d{1,2} \d{2}:\d{2}/`), (b) a message whose stored record has no `createdAt` and assert no timestamp node, (c) unit-test `formatMessageTime` from `src/ui/utils/format-time.ts` for a fixed epoch (contract invariants 5–6; mock-chrome + jsdom per existing harness)

### Implementation for User Story 3

- [ ] T008 [US3] Create `MessageTimestamp` component in `src/ui/components/chat.tsx`: inside `MessagePrimitive.Root`, read the current message via assistant-ui's `useMessage` hook (0.11 API — verify import from `@assistant-ui/react`), return `null` when `createdAt` is absent, otherwise render `<div className="sancho-message-time">{formatMessageTime(createdAt)}</div>`; add it to both `UserMessage` and `AssistantMessage` (research R1)
- [ ] T009 [P] [US3] Add `.sancho-message-time` styles in `src/ui/components/chat.css`: `font-size: 11px`, subdued `color: var(--chat-text-secondary)`, `margin-top: 4px`, and for user (accent) bubbles a translucent variant of `--chat-accent-text` so the label stays readable on the accent background (spec assumption: subdued, non-competing)

**Checkpoint**: US3 testable — timestamps on all new messages, none on legacy.

---

## Phase 6: User Story 2 — Composer has comfortable bottom spacing (Priority: P2)

**Goal**: Visible gap between composer and the sidebar's bottom edge (FR-003; contract invariant 4).

**Independent Test**: Chat view open — clear space below the input box at all panel widths.

### Tests for User Story 2

- [ ] T010 [US2] Extend `tests/e2e/layout.spec.ts`: assert the composer element's `getBoundingClientRect().bottom` is at least 8px less than the panel's `innerHeight` (contract invariant 4)

### Implementation for User Story 2

- [ ] T011 [US2] In `src/ui/components/chat.css` set `.sancho-composer` bottom padding so total space below the input is ≥ 8px (e.g. `padding: 12px 12px max(12px, env(safe-area-inset-bottom));` — research R4) without reintroducing an outer scrollbar (verify with T002's body assertions)

**Checkpoint**: US2 testable.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [ ] T012 Run `quickstart.md` manual validation (all 5 scenarios) in Brave and fix any visual deviations found
- [ ] T013 Run full gates — `pnpm typecheck && pnpm exec vitest run --coverage && pnpm lint && pnpm build && pnpm test:e2e` — and resolve failures

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies — T001 blocks only US3
- **US1 (Phase 3)** → **US4 (Phase 4)**: sequential — both edit `chat.css` (avoid conflicts)
- **US3 (Phase 5)**: needs T001 only; can run parallel with US1/US4 (different files: `chat.tsx`, `format-time.ts`, new test) except its CSS task T009 [P] which should land after US4's stylesheet edits
- **US2 (Phase 6)**: last — composer padding must not regress US1's no-outer-scroll assertions
- **Polish (Phase 7)**: after all stories

### Within Each User Story

- Tests first (T002, T005, T007, T010) → implementation → checkpoint

### Parallel Opportunities

```text
T001 (format-time util)          ║  T002→T003/T004 (US1)
T004 (list styles) parallel with T003 only if different files are touched — otherwise sequential
T009 (timestamp CSS) after T006 lands
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. T001 (cheap, unblocks US3 later)
2. Phase 3: T002 → T003 → T004
3. **STOP and VALIDATE**: full-bleed single-scrollbar layout works in Brave
4. Continue with US4 (the other P1)

### Incremental Delivery

1. US1 (layout) → US4 (overflow) → the two P1 defects fixed, shippable
2. US3 (timestamps) → US2 (composer gap) → full spec
3. Polish: quickstart manual pass + full gates

---

## Notes

- [P] tasks = different files, no dependencies on incomplete tasks
- FR-010 governs every implementation task: assistant-ui primitives first (`ThreadPrimitive.Viewport` as scroller, `useMessage` for timestamps); custom code only for formatting and CSS
- Commit after each task; pre-commit hook runs ESLint + Prettier
- Verify checklist format offline before implement: every task has checkbox, ID, story label (story phases only), and a file path
