# Quickstart: Validating the AI Agent Extension

End-to-end validation scenarios proving the feature works. Prerequisites and expected
outcomes only — implementation details live in `tasks.md`.

## Prerequisites

- Node.js 20+, pnpm
- Chromium/Chrome (MV3)
- An API key for any OpenAI-compatible provider, and/or a local ACP agent daemon plus the
  companion native-messaging host script

## Setup

```bash
pnpm install
pnpm dev          # WXT dev server; loads the extension with HMR
# or: pnpm build && pnpm zip  → load .output/chrome-mv3 as unpacked extension
```

## Scenario 1 — Sidebar chat with page awareness (US1, FR-001/002/003/004/007/016)

1. Configure a provider in the options page (API key method).
2. Open any article page, open the side panel, ask "summarize this page".
   - **Expect**: streamed summary within ~5s of first token; message references actual
     page content.
3. On a page with a reactive form (e.g., a sign-up form), ask "fill the form with test
   data".
   - **Expect**: fields populated, site validation accepts the values (native events).
4. Ask "what do you see on the screen?" without prior consent.
   - **Expect**: consent prompt; after granting once, visual analysis works for the rest
     of the conversation; after clearing the conversation, consent is required again.
5. Switch tabs mid-conversation and ask about the new page.
   - **Expect**: agent context follows the active tab; single continuous thread.
6. Run the loop-cap simulation (`pnpm test:unit agent-loop` runaway case).
   - **Expect**: loop stops at 25 iterations with a user-facing stop message.

## Scenario 2 — Provider configuration (US2, FR-005/006/012/014)

1. Save an invalid API key → send a chat message.
   - **Expect**: clear "connection failed" error; conversation preserved.
2. Save a valid key → chat works.
3. Switch method to ACP with the host script installed → chat works with network panel
   showing no cloud calls.
4. Remove the native host → error message with setup instructions.

## Scenario 3 — Selection actions (US3/US4, FR-008/009/010)

1. Select text in an editable field → right-click → "Fix grammar".
   - **Expect**: selection replaced in place within ~10s.
2. Select read-only text → same action.
   - **Expect**: result appended to the sidebar chat; page untouched.
3. In options, create a custom action "Translate to Spanish" with a prompt.
   - **Expect**: action appears in the context menu immediately and works on selections.
4. Disable a built-in action → it disappears from the menu.

## Scenario 4 — Settings page (US5, FR-013)

- Open options: layout follows browser-settings conventions; method switch toggles
  relevant fields; saved values restored on reopen.

## Scenario 5 — Persistence & quality gates (FR-011/017, Article VI)

1. Chat, restart the browser → history intact. Clear → history and consent gone.
2. `pnpm test` (Vitest + RTL) and `pnpm test:e2e` (Playwright, loaded extension) pass;
   coverage ≥ 80% on orchestration logic.
3. `pnpm lint && pnpm typecheck` clean; commit blocked if hooks fail.
