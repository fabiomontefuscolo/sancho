# Tasks: Rich Message Rendering

**Input**: Design documents from `/specs/004-rich-message-rendering/`

**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/ui-contract.md, quickstart.md

**Tests**: Included — constitution principle V mandates executable tests, and the spec defines per-story acceptance scenarios.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- All paths are relative to the repository root

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Install rendering dependencies pinned to the installed `@assistant-ui/react@0.11.58` line (research R1–R3)

- [x] T001 Install dependencies: `@assistant-ui/react-markdown@0.11.10`, `@assistant-ui/react-syntax-highlighter@0.11.10`, `react-syntax-highlighter@^16`, `@types/react-syntax-highlighter`, `remark-gfm` in package.json

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared building blocks used by every story: the copy control and the raw-message-source accessor

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T002 Create shared copy control in src/ui/components/copy-button.tsx — props: `getText: () => string`, `className?: string`; states `idle | copied | failed`; uses `navigator.clipboard.writeText` with `<textarea>` + `document.execCommand("copy")` fallback; shows transient "Copied" (~1.5s) or "Copy failed" feedback per FR-007 (research R4)
- [x] T003 [P] Add raw markdown text accessor in src/ui/hooks/useSanchoRuntime.ts — expose a helper (e.g., `getMessageRawText(messageId)`) that returns the persisted `Message.parts[].text` concatenated verbatim from the conversation state, so message copy never re-serializes the DOM (research R4)

**Checkpoint**: Copy control renders and copies in isolation; raw-text accessor returns exact source

---

## Phase 3: User Story 1 - Reading a formatted agent answer (Priority: P1) 🎯 MVP

**Goal**: Agent messages render as sanitized markdown (headings, lists, links, emphasis, blockquotes, code) instead of raw syntax, progressively while streaming

**Independent Test**: Component test renders an assistant message containing a heading, bulleted list, link, and bold text; each renders formatted with no raw markdown symbols visible (US1/AC1)

### Tests for User Story 1 ⚠️

- [x] T004 [P] [US1] Create tests/component/markdown-rendering.test.tsx: (a) heading/list/link/emphasis render formatted with no raw syntax visible (US1/AC1, FR-001); (b) mid-stream unclosed bold/fence renders as plain text without broken layout, final text renders complete (US1/AC2, FR-002); (c) message containing `<script>alert(1)</script>` and `<img src="https://evil.example/x.png">` executes nothing, loads no remote resource, degrades to text (FR-003, edge case); (d) malformed markdown degrades to readable plain text (US1/AC3)

### Implementation for User Story 1

- [x] T005 [US1] Create src/ui/components/markdown-text.tsx — export `MarkdownText` built on `MarkdownTextPrimitive` from `@assistant-ui/react-markdown` with `remarkPlugins={[remarkGfm]}` (research R1/R2); no `rehype-raw` (FR-003)
- [x] T006 [US1] Wire `MarkdownText` as the assistant message text part in src/ui/components/chat.tsx — `<MessagePrimitive.Parts components={{ Text: MarkdownText }} />` in `AssistantMessage` only; `UserMessage` keeps plain rendering (FR-009)
- [x] T007 [P] [US1] Add markdown element styles in src/ui/components/chat.css — headings, lists, links, blockquotes, inline code scoped under `.sancho-message-assistant`; all using `var(--chat-*)` tokens; long links wrap via existing `overflow-wrap: anywhere`; no rule may cause `.sancho-viewport` horizontal scroll (contract 4, FR-012)

**Checkpoint**: US1 independently verifiable — `pnpm exec vitest run tests/component/markdown-rendering.test.tsx` green; assistant answers render formatted, user messages unchanged

---

## Phase 4: User Story 2 - Reading and reusing code blocks (Priority: P1)

**Goal**: Fenced code blocks render with syntax highlighting and a language label, scroll internally when wide, and offer one-click copy of exactly the code content

**Independent Test**: Component + e2e: a `typescript` fenced block renders highlighted with a visible language label; clicking its copy icon puts exactly the code (no fences) on the clipboard with confirmation; a 200-char line scrolls within the block, not the list (US2/AC1–AC3)

### Tests for User Story 2 ⚠️

- [x] T008 [P] [US2] Extend tests/component/markdown-rendering.test.tsx: tagged block renders highlighted with visible language label (US2/AC1, FR-004); untagged block renders plain monospaced without errors (US2/AC4); wide lines scroll within the block only (US2/AC3, FR-008, contract 8)
- [x] T009 [P] [US2] Create tests/component/copy-controls.test.tsx: code copy places exactly the code content (no fences, no extra whitespace) on the clipboard with "Copied" confirmation (US2/AC2, FR-005, contract 7)
- [x] T010 [P] [US2] Create tests/e2e/rich-messages.spec.ts: real-extension test seeding a conversation with a highlighted code block; assert clipboard receives exactly the code content on copy click, and `scrollWidth === clientWidth` on `.sancho-viewport` (003 invariant preserved)

### Implementation for User Story 2

- [x] T011 [US2] Create src/ui/components/code-block.tsx — custom `CodeHeader`/code override for `MarkdownTextPrimitive` using `makePrismAsyncLightSyntaxHighlighter` from `@assistant-ui/react-syntax-highlighter` (research R3); register exactly: typescript, javascript, python, rust, go, java, c, cpp, json, bash; header shows the language label (or "code" when untagged) and embeds the `CopyButton` from T002 fed with exactly the code content
- [x] T012 [US2] Map Prism token colors to `var(--chat-*)` variables and style code blocks (header, internal `overflow-x: auto`, containment) in src/ui/components/chat.css (research R8, FR-008)

**Checkpoint**: US1+US2 independently verifiable — new component tests + `tests/e2e/rich-messages.spec.ts` green

---

## Phase 5: User Story 3 - Copying a whole message (Priority: P2)

**Goal**: Each agent message has a copy control at its top right that copies the raw markdown source verbatim

**Independent Test**: Component + e2e: click the message copy icon on a rendered assistant message; the clipboard contains the exact raw markdown source; paste is verbatim (US3/AC1)

### Tests for User Story 3 ⚠️

- [x] T013 [P] [US3] Extend tests/component/copy-controls.test.tsx: message copy places the raw markdown source verbatim on the clipboard (US3/AC1, FR-006); clipboard failure surfaces visible "Copy failed" feedback instead of a silent no-op (US3/AC2, FR-007)
- [x] T014 [P] [US3] Extend tests/e2e/rich-messages.spec.ts: message copy in the real extension yields the exact raw markdown on the clipboard

### Implementation for User Story 3

- [x] T015 [US3] Add the message-level copy control in src/ui/components/chat.tsx — `CopyButton` positioned at the top right of `AssistantMessage` (`MessagePrimitive.Root`), fed from the T003 raw-text accessor, keyed by the message id obtained from `useMessage`; absolute-positioned within the relative message bubble; not added to `UserMessage` (spec non-goal)

**Checkpoint**: US3 independently verifiable — message copy yields verbatim raw markdown

---

## Phase 6: User Story 4 - Comfortable reading typography (Priority: P2)

**Goal**: Readable system font stacks everywhere, and a persisted `small`/`medium`/`large` font-size preference editable from both the sidebar settings view and the options page, kept in sync

**Independent Test**: Component + e2e: switch font size in the sidebar settings view → message text rescales immediately; change it on the options page → sidebar reflects it live; reload extension → choice persists (US4/AC2–AC3)

### Tests for User Story 4 ⚠️

- [x] T016 [P] [US4] Create tests/component/font-size.test.tsx: `uiPrefs` read/write helpers default to `"medium"` on missing/unknown values (data-model validation rule); `useUiPrefs` hook applies `sancho-font-*` class and reacts to `chrome.storage.sync.onChanged` (US4/AC2); persistence wiring stores the choice under the sync key `uiPrefs` with field `fontSize` (US4/AC3)
- [x] T017 [P] [US4] Extend tests/e2e/rich-messages.spec.ts: set font size via the sidebar settings view, reload the extension page, assert the choice persists; assert layout intact (timestamps visible, no horizontal scroll) at every size (US4/AC4, contract 12)

### Implementation for User Story 4

- [x] T018 [US4] Add `UiPrefs` type (`fontSize: "small" | "medium" | "large"`, default `"medium"`) in src/types.ts and `uiPrefs` sync read/write + defaulting helpers in src/storage/settings.ts
- [x] T019 [US4] Create src/ui/hooks/use-ui-prefs.ts — reads `uiPrefs` from `chrome.storage.sync`, subscribes to `onChanged`, returns current prefs + setter
- [x] T020 [US4] Create src/ui/components/settings-view.tsx — sidebar settings view with a font-size select (small/medium/large) writing via T019; add a settings entry point (icon button) in the chat header and extend the existing `"chat" | "list"` view state in src/ui/components/chat.tsx with `"settings"`; apply the `sancho-font-*` class on `.sancho-chat-root` from T019
- [x] T021 [P] [US4] Add the same font-size select to the options page in src/ui/components/settings-panel.tsx, bound to the same `uiPrefs` key (clarification: both surfaces, kept in sync)
- [x] T022 [P] [US4] Update fonts and font-size scale in src/ui/components/chat.css — body: system UI stack `-apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`; code: `ui-monospace, "SF Mono", "Cascadia Mono", Consolas, monospace` (research R7); define `--chat-font-size` per `sancho-font-small|medium|large` and consume it in messages, code blocks, composer, and timestamps (FR-010, FR-011)

**Checkpoint**: US4 independently verifiable — immediate rescale, cross-surface sync, persistence across reload

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Whole-feature verification

- [x] T023 Run the full gates: `pnpm typecheck && pnpm exec vitest run --coverage && pnpm lint && pnpm build && pnpm test:e2e` — coverage gates ≥ 80% unchanged, all e2e suites (003 layout + 004 rich-messages) green
- [ ] T024 [P] Manual quickstart validation in Brave per specs/004-rich-message-rendering/quickstart.md (markdown demo, code copy, message copy, wide-line containment, script/img safety probe, font-size sync + persistence, timestamp regression)
- [x] T025 Add a perf assertion for SC-005 in tests/e2e/rich-messages.spec.ts — seed a conversation with 100 markdown-rich messages, assert initial render completes under 1 second and the message list scrolls without layout jank (no horizontal scroll, single scrollbar)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on T001 — BLOCKS all user stories
- **User Stories (Phases 3–6)**: All depend on Phase 2 completion; US2 depends on US1's `MarkdownText` (T005); US3 depends only on Phase 2; US4 depends only on Phase 2
- **Polish (Phase 7)**: Depends on all stories

### User Story Dependencies

- **US1 (P1)**: After Phase 2 — no story dependencies
- **US2 (P1)**: Requires US1's `MarkdownText` component to attach the code override — sequence after T005
- **US3 (P2)**: Independent of US1/US2 (uses Phase 2 primitives only) — can run in parallel with them
- **US4 (P2)**: Independent of other stories — can run in parallel

### Within Each User Story

- Tests MUST be written and FAIL before implementation
- Component/hook before wiring into chat.tsx
- Story complete and verified before moving to the next priority

### Parallel Opportunities

- T003 parallel with T002
- Within each story: test files marked [P] are independent; CSS tasks ([P]) don't block component logic
- US3 and US4 can proceed in parallel with US1→US2 chain once Phase 2 lands

---

## Parallel Example: User Story 2

```bash
# Launch all US2 tests together (before implementation):
Task: "Extend tests/component/markdown-rendering.test.tsx with code-block assertions"
Task: "Extend tests/component/copy-controls.test.tsx with code copy assertions"
Task: "Create tests/e2e/rich-messages.spec.ts with clipboard + no-hscroll assertions"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1 (T001)
2. Complete Phase 2 (T002–T003)
3. Complete Phase 3 (T004–T007)
4. **STOP and VALIDATE**: markdown-rendering component tests green; assistant messages render formatted in Brave
5. Demo-ready increment

### Incremental Delivery

1. T001–T003 → foundation ready
2. US1 → formatted markdown (MVP)
3. US2 → highlighted, copyable code blocks
4. US3 → whole-message copy
5. US4 → typography + font-size setting
6. T023–T024 → full gates + manual validation

---

## Notes

- [P] tasks = different files, no dependencies
- Commit after each task or logical group (pre-commit runs lint-staged)
- Mark each task `[X]` here when completed
- After implementation, run `/speckit.converge` to reconcile code against spec/plan/tasks
- User messages intentionally keep plain-text rendering (spec FR-009 / non-goal)

---

## Phase 8: Convergence

- [ ] T026 Block remote image loading in rendered markdown — override the `img` component in src/ui/components/markdown-text.tsx so only `data:` URLs render and remote sources degrade to alt text, with a component test asserting no remote request element is created, per spec edge case "remote image loading follows the same no-remote-content safety rule" (contradicts)
