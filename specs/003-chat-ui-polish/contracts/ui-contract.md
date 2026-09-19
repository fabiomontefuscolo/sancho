# UI Contract: Chat UI Polish

The project's external interface is the extension sidebar UI. This feature changes no
message protocol, storage keys, or port contracts — visual contract only.

## Layout invariants

1. **Single scrollbar**: at any sidebar width, `document.documentElement` and `document.body`
   have no vertical or horizontal scrollbar; the only scrolling region is the message
   viewport (`ThreadPrimitive.Viewport`).
2. **Full width**: the chat root, conversation list, error/prompt states, and consent banner
   span 100% of the sidebar width — no dead side margins.
3. **Fixed chrome**: top bar and composer never scroll with the message history.
4. **Composer gap**: visible space (≥ 8px) between the composer and the bottom edge.

## Message contract

5. Every rendered user/assistant message whose stored record has `createdAt` displays a
   timestamp label formatted `EEE MMM d HH:mm` (e.g. `Sat Sep 19 22:56`), in a subdued
   secondary-text style inside the message's column.
6. Messages without `createdAt` render no timestamp (no fallback date).
7. Reloaded conversations show original times, not reload time (covered by 5 — the value
   comes from storage).

## Overflow contract

8. The message list element never gains `overflow-x` scrolling (`scrollWidth === clientWidth`)
   for any message content.
9. Images render at `min(natural width, message max-width)`, aspect ratio preserved.
10. `pre`/code content wider than the bubble scrolls horizontally **inside** the bubble only.
11. Unbroken strings (URLs, tokens) wrap via `overflow-wrap:anywhere` without widening the list.

## Test hooks

- Component tests (Testing Library): timestamp label text, absent-timestamp case, composer
  gap class presence.
- Layout assertions in jsdom are limited (no real layout engine); the single-scrollbar and
  overflow invariants are verified by CSS rules plus a Playwright e2e check comparing
  `scrollWidth`/`clientWidth` and `scrollHeight`/`clientHeight` of `body` vs the viewport.
