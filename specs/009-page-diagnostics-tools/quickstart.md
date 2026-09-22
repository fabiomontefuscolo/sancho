# Quickstart: Page Diagnostics Tools

**Feature**: [spec.md](spec.md) | Manual validation in a real browser (Brave/Chrome, MV3).

Prerequisites: `pnpm build` completed; extension reloaded from `.output/chrome-mv3`; a working provider configured. A test page is needed — any page where you can open DevTools and run snippets works, or use a small local HTML file that logs errors and fetches a failing URL on load.

## S1. Consent gate

1. Start a new conversation on any normal web page.
2. Ask: "check the console errors on this page".
3. Verify the diagnostics consent banner appears explaining what will be shared, and the agent has not received any console data yet.
4. Dismiss/decline → the agent answers without diagnostics data.

## S2. Console error diagnosis

1. On the test page, trigger an error (DevTools console: `console.error("boom 42")` and `throw new Error("load failed")` — for load-time capture, put them in the page HTML and reload).
2. Grant consent via the banner.
3. Ask: "what's wrong with this page?" → the agent's reply names `boom 42` / `load failed`.

## S3. Clean console honesty

1. On a quiet page (no console activity since load), ask "any console errors?" → the agent reports the console is clean rather than inventing messages.

## S4. Network failure diagnosis

1. On the test page trigger a failing request (`fetch("/nonexistent-endpoint")` → 404, and a request to a blocked/invalid host → network error).
2. Ask: "did any network requests fail?" → the agent names the failing URL and outcome (404 / failure reason).

## S5. No bodies, ever

1. On a page that POSTs a form or JSON, ask the agent for the request body → the agent explains only metadata (URL, method, status, timing) is available.

## S6. Consent resets per conversation

1. After granting in one conversation, start a new conversation and ask a diagnostics question → the consent banner appears again.

## S7. Restricted page

1. Open `chrome://extensions`, ask "check console errors here" → the agent reports diagnostics are unavailable on this page (no crash, no hang).

## S8. Navigation scoping

1. Cause an error on page A, navigate to page B in the same tab, then ask about console errors → the agent sees only page B's (empty/fresh) console state.

## S9. ACP provider (if configured)

1. Switch to the ACP provider and repeat S2 → the local agent can call the diagnostics tools and is equally consent-gated.
