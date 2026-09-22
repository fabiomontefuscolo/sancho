# Data Model: Page Diagnostics Tools

**Date**: 2026-09-22 | **Feature**: [spec.md](spec.md)

## Entity: Console Entry

Captured by the MAIN-world probe; buffered in-page.

| Field     | Type                                                  | Constraints                                       |
| --------- | ----------------------------------------------------- | ------------------------------------------------- |
| level     | `"log" \| "info" \| "warn" \| "error" \| "exception"` | `exception` = window.onerror / unhandledrejection |
| text      | string                                                | args joined with spaces, truncated to 500 chars   |
| timestamp | number                                                | ms epoch                                          |

Buffer: ring, max **200** entries per page load; reset on navigation.

## Entity: Network Request Record

Captured by background `webRequest` listeners; buffered in `chrome.storage.session` key `diagNet:<tabId>`.

| Field      | Type           | Constraints                                       |
| ---------- | -------------- | ------------------------------------------------- |
| url        | string         | truncated to 300 chars                            |
| method     | string         | e.g. GET, POST                                    |
| status     | number \| null | HTTP status when completed                        |
| error      | string \| null | `onErrorOccurred` reason (e.g. `net::ERR_FAILED`) |
| startTime  | number         | ms epoch                                          |
| durationMs | number         | completion − start                                |

Buffer: ring, max **100** entries per tab; reset on tab navigation (`tabs.onUpdated` loading with URL change) and on tab close.

## Entity: Diagnostics Consent

| Field       | Value                                                                                                                                |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Carrier     | `Conversation.diagnosticsConsent: boolean`                                                                                           |
| Default     | `false` (set in `createConversation`)                                                                                                |
| Storage     | `chrome.storage.local` via conversation record                                                                                       |
| Lifecycle   | granted → `true` for that conversation; new conversation → `false`; declining leaves `false` (prompt reappears on next tool attempt) |
| Persistence | persists with the conversation record, but `chat.clear` creates a fresh conversation (consent reset) — matches screenshot consent    |

## Tool result shapes

- `getConsoleMessages` → `{ ok: true, entries: ConsoleEntry[], truncated: boolean }` | `{ ok: false, error: string }`
- `getNetworkRequests` → `{ ok: true, requests: NetworkRequestRecord[], truncated: boolean }` | `{ ok: false, error: string }`
- Consent gate failure: `{ ok: false, error: "diagnostics_consent_required" }`
- Restricted page: `{ ok: false, error: "page interaction unavailable on this page (restricted)" }`

## Type changes

- `src/types.ts`: `Conversation` gains `diagnosticsConsent: boolean`.
- New exported interfaces `ConsoleEntry`, `NetworkRequestRecord` in `src/agent/diagnostics.ts` (network) and `entrypoints/diag-probe.ts`/`content.ts` boundary (console).

## Non-goals

- No bodies, no headers, no cookies (spec FR-004).
- No persistence of buffers across browser restarts (`storage.session` semantics; spec FR-009).
- No cross-tab reads (spec FR-010).
