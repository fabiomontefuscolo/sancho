# Quickstart: Chat UI Polish

## Prerequisites

- `pnpm install` already run; extension built (`pnpm build`).
- Brave with the extension loaded from `.output/chrome-mv3/` (reload after each build).

## Automated validation

```bash
pnpm test        # unit + component: timestamp rendering, layout classes, absent-timestamp case
pnpm test:e2e    # Playwright: no body scrollbars, viewport is sole scroll region, image/pre containment
pnpm typecheck && pnpm lint
```

Expected: all suites pass; coverage gates (≥80% statements/branches) hold.

## Manual validation (sidebar open on any page)

1. **Full-bleed layout (US1)**: open the sidebar. No white margins at left/right edges in
   the list or chat view; the page itself never scrolls — only the message history does;
   the top bar and input stay put while scrolling a long conversation.
2. **Composer gap (US2)**: the input box visibly floats above the bottom edge.
3. **Timestamps (US3)**: send a message — both your message and the reply show
   `Sat Sep 19 22:56`-style labels. Switch away and back to the conversation — the labels
   show the original times.
4. **Overflow (US4)**: ask the agent for a screenshot (image fits the bubble, list doesn't
   scroll sideways) and for a wide code snippet (`pre` scrolls inside the bubble only).
   Paste a very long URL — it wraps.
5. **Narrow panel**: drag the sidebar to minimum width — no horizontal scrollbar anywhere.

## Cross-references

- Visual invariants: `contracts/ui-contract.md`
- Timestamp source/format: `data-model.md`, `research.md` R1
