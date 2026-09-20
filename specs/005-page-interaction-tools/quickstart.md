# Quickstart: Page Interaction Tools (005)

## Prereqs

```bash
pnpm install
pnpm build
```

Load/reload `sancho/.output/chrome-mv3/` at `brave://extensions` (Developer mode).

## Automated gates

```bash
pnpm exec vitest run tests/unit/snapshot.test.ts tests/unit/refs.test.ts tests/unit/edit-text.test.ts
pnpm test:e2e   # includes tests/e2e/page-tools.spec.ts
pnpm typecheck && pnpm lint
pnpm exec vitest run --coverage   # global ≥ 80% gates
```

## Manual validation (Brave sidebar)

1. **Snapshot + click (US1)**: open any page with a visible labeled button (e.g. strudel.cc) → ask the agent "take a snapshot of this page and press play" → the agent calls `snapshotPage`, picks the `button "play"`-like entry by name, clicks it by ref → playback starts, first attempt, no selector guessing.
2. **Stale reference (US1/AC3)**: after a snapshot, navigate the page or trigger a re-render, then have the agent act on an old ref → tool returns "stale reference" and nothing is clicked.
3. **CodeMirror edit (US2)**: on strudel.cc, ask the agent to replace the editor code with a short pattern (e.g. `s("bd hh sd hh")`) → the editor content changes and pressing play runs the _new_ code (proves internal state updated, not just DOM).
4. **Insert mode (US2/AC3)**: ask the agent to add `.cpm(120)` at the cursor without replacing → existing code is preserved around the insertion.
5. **Plain form (US2/AC2)**: on any site with a normal form, ask the agent to fill a field → value set, page reacts (framework events fired).
6. **Snapshot bounds (US1/AC4)**: on a very busy page (e.g. a long GitHub issue list), ask for a snapshot → returns quickly, compact outline with a truncation notice.
