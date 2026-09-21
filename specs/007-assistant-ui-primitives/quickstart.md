# Quickstart: Validating Assistant-UI Primitives Alignment & Settings Polish

**Date**: 2026-09-21
**Feature**: `007-assistant-ui-primitives`

Runnable end-to-end validation of the feature. Prerequisite: provider configured (API key or Copilot) per feature 006.

## Automated gates (must all pass)

```bash
pnpm exec vitest run      # unit/component, coverage ≥80% on src/agent|providers|storage
pnpm lint
pnpm typecheck
pnpm build
pnpm test:e2e             # conversations, rich-messages, agent-loop, layout suites updated
```

## Manual validation (Brave, extension id `jmpiiajepljjaimgdjmfdjiahhaajfma`)

1. `pnpm build`, then load/reload `dist` via `brave://extensions` (Developer mode → Load unpacked).
2. Open the side panel on any page.

### S1 — Composer & stop (spec US1)

- Type multiple lines (Shift+Enter adds newlines); the input grows inside the rounded card.
- Press Enter → message sends, composer clears.
- Send a prompt that triggers tools (e.g., "read this page") and click the stop button mid-run → run cancels, composer returns to idle within ~1 s.

### S2 — Thought process (spec US2)

- Send a tool-triggering prompt → the assistant message shows a collapsible "Thought process" group listing tool invocations with running→done states.
- If the model emits reasoning, reasoning text appears inside the group above the answer; otherwise the group shows tools only (no empty block).
- Reload the panel → the message shows final text only (thought process not restored).

### S3 — Action bar (spec US3)

- Hover a message → action bar appears; non-last messages show it only on hover.
- Click Copy → clipboard holds the raw markdown; button shows a transient check.
- Click Reload on an assistant reply → the reply is replaced by a freshly generated one; during the run the bar is hidden.

### S4 — Error display (spec US4)

- Break the provider (e.g., wrong API key) and send a message → the failed message shows a distinct error notice (alert role), not assistant-styled text.
- Restore the provider; screenshot-consent prompts still show the consent banner, not an error notice.

### S5 — Thread list (spec US5)

- Hamburger → list: conversations show with the active one marked.
- Create, switch, and delete conversations; deleting the active one lands on a fresh conversation; selection returns to chat view.

### S6 — Settings & appearance (spec US6)

- Click the gear → the extension options page opens.
- Options nav shows `Connection | Appearance | Actions | About`; Appearance contains the font-size select.
- In the panel, click "Aa" → quick font-size view; change size → applies immediately and persists after reload; options page shows the same value.

### S7 — Thread polish (spec US7)

- In a long conversation, scroll up → floating scroll-to-bottom button appears; clicking it jumps to the newest content.
- A new conversation shows the welcome empty state.

## Expected outcomes

- All seven scenarios pass; automated gates green; no regression in existing e2e suites.
