# Quickstart: Chat Session Management Validation

Prerequisites: `pnpm install`; for e2e, a Chromium/Brave binary. Build with
`pnpm build` and load `.output/chrome-mv3` as an unpacked extension.

## Automated validation

- `pnpm test` — unit + component suites, including:
  - `tests/unit/conversations.test.ts`: store CRUD, index ordering (updatedAt desc),
    title derivation (first user message, 40-char ellipsis, placeholder), legacy
    migration, active-delete replacement, run-cancel-on-delete.
  - `tests/component/conversation-list.test.tsx`: hamburger opens list; entry click
    selects + closes; back button and Esc close without side effects; per-entry delete;
    new-conversation affordance.
- `pnpm test:e2e` — Playwright with extension loaded:
  - `tests/e2e/conversations.spec.ts`: create two conversations via chat sends, open
    hamburger, verify order and titles, select older conversation, verify history
    renders; delete active conversation, verify fresh empty chat; restart browser
    context and verify persistence (SC-003) and deleted id absence (SC-004).

## Manual validation

1. Open the side panel; confirm the hamburger button at the top-left of the top bar.
2. Send a message ("hello from first chat"); reopen the list — entry titled from that
   message appears.
3. In the list, start a new conversation; confirm empty chat view; send "second chat".
4. Reopen the list: "second chat" above "hello from first chat" (recency order).
5. Click the older entry — list closes, history of the first chat renders (SC-002).
6. Reopen the list, press Esc — same conversation still shown, no state change.
7. Reopen, delete the active conversation — chat view becomes empty; the deleted entry
   is gone from the list.
8. Restart the browser — list and active selection are restored; deleted conversation
   stays gone.
9. Start a streaming run, open the list mid-stream, return — the run completed into
   the original conversation intact (FR-012).
10. With an ACP provider configured, resume an old conversation and send a follow-up —
    the agent answers with prior context (session reuse).

Expected outcomes map to SC-001…SC-005 in [spec.md](./spec.md); message formats and
storage keys are defined in [contracts/conversations.md](./contracts/conversations.md).
