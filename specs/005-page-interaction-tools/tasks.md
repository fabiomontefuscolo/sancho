# Tasks: Page Interaction Tools

**Input**: Design documents from `/specs/005-page-interaction-tools/`

**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/tool-contract.md, quickstart.md

**Tests**: Included — constitution principle V mandates executable tests, and the spec defines per-story acceptance scenarios.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- All paths are relative to the repository root

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: No new dependencies or configuration — all logic uses the existing content-script injection, zod schemas, and test harness. Intentionally a single no-op checkpoint.

- [ ] T001 Verify baseline gates pass before starting (`pnpm typecheck && pnpm exec vitest run && pnpm test:e2e`)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The element reference registry that both US1 (snapshot refs) and US2 (ref-targeted editing) depend on

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [ ] T002 [P] Create tests/unit/refs.test.ts: mint returns `e<N>` ids and is idempotent per element; resolve returns the live element; after removing the element from the DOM, resolve reports stale; refs minted in one registry never collide
- [ ] T003 Create src/content/refs.ts — per-tab registry on the isolated-world `globalThis` (guarded like `__sanchoContentLoaded` so repeated injections share it): `Map<string, WeakRef<Element>>` + `WeakMap<Element, string>`; API: `mintRef(el)`, `resolveRef(ref)` → `{ status: "ok", element } | { status: "stale" } | { status: "unknown" }` per research R1

**Checkpoint**: refs unit tests green; registry usable by later stories

---

## Phase 3: User Story 1 - Agent finds and acts on elements by reference (Priority: P1) 🎯 MVP

**Goal**: `snapshotPage` returns a bounded outline of interactive elements (`role "name" @eN`), and `clickElement`/`fillField`/`selectOption` accept refs re-resolved at action time with clear staleness errors

**Independent Test**: e2e on a served page with a labeled button among 50+ elements: snapshot names the button with a ref, click-by-ref fires its action, a removed element yields "stale reference" (US1/AC1–AC3, SC-001, SC-004)

### Tests for User Story 1 ⚠️

- [ ] T004 [P] [US1] Create tests/unit/snapshot.test.ts: interactive elements collected with role and accessible name (aria-label → aria-labelledby → label → text ≤ "80 chars" → placeholder/title/alt/value) per research R2; non-interactive noise omitted; password inputs appear with role+name but never value (FR-010); cap default 300 with `truncated` count (FR-002); open shadow roots pierced (FR-008 partial); same-origin iframe entries marked, cross-origin yields one inaccessible marker line (contract 4)
- [ ] T005 [P] [US1] Create tests/e2e/page-tools.spec.ts: serve a local page with a labeled button among 50+ elements and a CodeMirror-stand-in contenteditable; drive tools via the real background path; assert snapshot names the button, click-by-ref works first attempt (SC-001), stale ref returns "stale reference" and acts on nothing (SC-004)

### Implementation for User Story 1

- [ ] T006 [US1] Create src/content/snapshot.ts — `buildSnapshot(maxElements = 300)`: collects `a[href], button, input, select, textarea, summary, [contenteditable], [role=button|link|checkbox|tab|menuitem|option|switch|textbox|combobox], [tabindex] >= 0` walking open shadow roots and same-origin iframes; accessible-name resolution order per research R2; mints a ref per element via T003; returns `{ elements: SnapshotEntry[], truncated: number }` where SnapshotEntry is `{ ref, role, name, frame }` with `frame` = `null` for top frame or `"[frame N]"` per data-model
- [ ] T007 [US1] Extend src/agent/tools.ts — add `snapshotPage` tool definition `{ maxElements?: number }` (default 300, description tells the agent to snapshot before interacting per research R5); add optional `ref` to clickElement/fillField/selectOption schemas with a zod refinement requiring exactly one of `selector`/`ref`; route `page.snapshot` and ref-carrying actions in executeTool
- [ ] T008 [US1] Wire entrypoints/content.ts — add `page.snapshot` case calling buildSnapshot; in the click/fill/select cases resolve `ref` via T003 when present (re-resolution at action time, FR-004): `{ status: "stale" }` or unknown ref returns `{ ok: false, error: "stale reference" }` and acts on nothing; selector path unchanged

**Checkpoint**: US1 independently verifiable — snapshot/refs unit tests + e2e click-by-ref green

---

## Phase 4: User Story 2 - Agent edits rich text editors (Priority: P1)

**Goal**: `setEditorText` replaces or inserts text via synthetic input events so contenteditable editors (CodeMirror/Monaco) update internal state; plain inputs keep working with framework events

**Independent Test**: e2e CodeMirror-stand-in (contenteditable whose host mirrors state via its own beforeinput listener): replace → mirrored state equals new text (SC-002); insert at caret preserves surrounding content (US2/AC3); plain input fires input+change (US2/AC2)

### Tests for User Story 2 ⚠️

- [ ] T009 [P] [US2] Create tests/unit/edit-text.test.ts: contenteditable replace dispatches cancelable `beforeinput` with `inputType: "insertReplacementText"` and updates the editable; insert dispatches `inputType: "insertText"` at caret preserving surroundings (FR-007); input/textarea path uses the prototype native setter and fires bubbling `input` + `change` (FR-006); missing target returns `{ ok: false, error }` and changes nothing (contract 13)

### Implementation for User Story 2

- [ ] T010 [US2] Create src/content/edit-text.ts — `setEditorText(target, text, mode)` per research R3: focus target; contenteditable replace = select-all then `beforeinput` `InputEvent` `insertReplacementText`, fallback `document.execCommand("insertText")` when content unchanged; insert = `beforeinput` `insertText` at caret; input/textarea = native setter + `input`/`change` events
- [ ] T011 [US2] Extend src/agent/tools.ts and entrypoints/content.ts — add `setEditorText` tool `{ selector?: string, ref?: string, text: string, mode: "replace" | "insert" }` with exactly-one-of refinement and default mode `replace` per data-model; route `page.setText` resolving selector or ref via the T003 registry
- [ ] T012 [P] [US2] Extend tests/e2e/page-tools.spec.ts: replace on the CodeMirror stand-in → host-mirrored state equals new text (SC-002); insert at caret preserves surroundings; plain input path fires events

**Checkpoint**: US2 independently verifiable — edit-text unit tests + e2e green

---

## Phase 5: User Story 3 - Agent narrates what it acted on (Priority: P3)

**Goal**: Ref-based action results include the target's role and accessible name so the agent can confirm what happened (FR-009)

**Independent Test**: click-by-ref result contains `{ ok: true, role, name }` matching the snapshot entry (US3/AC1, contract 7)

### Tests for User Story 3 ⚠️

- [ ] T013 [P] [US3] Extend tests/unit/snapshot.test.ts and tests/e2e/page-tools.spec.ts: ref-based click/fill/setEditorText results include role and name identical to the snapshot entry

### Implementation for User Story 3

- [ ] T014 [US3] Return `{ ok: true, role, name }` from the ref-based click/fill/select/setEditorText paths in entrypoints/content.ts (role+name looked up from the resolved element using the snapshot.ts naming helpers)

**Checkpoint**: US3 verifiable — narration fields present in all ref-based results

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Whole-feature verification

- [ ] T015 Run the full gates: `pnpm typecheck && pnpm exec vitest run --coverage && pnpm lint && pnpm build && pnpm test:e2e` — coverage gates ≥ 80% unchanged, all e2e suites green
- [ ] T016 [P] Manual quickstart validation in Brave per specs/005-page-interaction-tools/quickstart.md (snapshot+click on strudel.cc, stale ref, CodeMirror replace, insert mode, plain form, busy-page bounds)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on T001 — BLOCKS all user stories
- **User Stories (Phases 3–5)**: All depend on Phase 2; US2 depends on Phase 2 only (T010 is independent of US1's snapshot, but T011/T012 reuse the ref registry); US3 depends on US1 (naming helpers) and US2 (edit path)
- **Polish (Phase 6)**: Depends on all stories

### User Story Dependencies

- **US1 (P1)**: After Phase 2 — no story dependencies
- **US2 (P1)**: After Phase 2 — can run in parallel with US1 until T011 (shares tools.ts and the ref registry)
- **US3 (P3)**: After US1 + US2 — pure augmentation of their result shapes

### Within Each User Story

- Tests MUST be written and FAIL before implementation
- Content modules (pure, jsdom-tested) before background/content wiring
- Story complete and verified before moving to the next priority

### Parallel Opportunities

- T002 (refs test) parallel with nothing else in Phase 2 — T003 implements it
- Within US1: T004 ∥ T005 (unit vs e2e files)
- Within US2: T009 ∥ T012
- US1 and US2 phases can overlap: T006 (snapshot.ts) ∥ T010 (edit-text.ts)

---

## Parallel Example: User Story 1 + 2 overlap

```bash
# After Phase 2, launch in parallel:
Task: "Create src/content/snapshot.ts (US1)"
Task: "Create src/content/edit-text.ts (US2)"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1 (T001)
2. Complete Phase 2 (T002–T003)
3. Complete Phase 3 (T004–T008)
4. **STOP and VALIDATE**: snapshot unit tests + e2e click-by-ref green in Brave
5. Demo-ready increment

### Incremental Delivery

1. T001–T003 → foundation ready
2. US1 → snapshot + ref actions (MVP)
3. US2 → editor-aware typing
4. US3 → action narration
5. T015–T016 → full gates + manual validation

---

## Notes

- [P] tasks = different files, no dependencies
- Commit after each task or logical group (pre-commit runs lint-staged)
- Mark each task `[X]` here when completed
- After implementation, run `/speckit.converge` to reconcile code against spec/plan/tasks
- Selector-based interaction stays backward compatible; refs are additive (spec assumption)
