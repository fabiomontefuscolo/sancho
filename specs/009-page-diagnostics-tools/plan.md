# Implementation Plan: Page Diagnostics Tools

**Branch**: `009-page-diagnostics-tools` | **Date**: 2026-09-22 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/009-page-diagnostics-tools/spec.md`

## Summary

Add two agent tools — `getConsoleMessages` and `getNetworkRequests` — so the agent can diagnose page problems. Console capture uses a MAIN-world probe registered at `document_start` (ring buffer in-page, relayed to the isolated content script via `window.postMessage` on read); network capture uses `chrome.webRequest` observation (new `webRequest` permission) with per-tab ring buffers in `chrome.storage.session` so data survives service-worker restarts. Both tools are gated by a new per-conversation `diagnosticsConsent` mirroring the screenshot-consent flow, with hard caps/truncation for context protection and no bodies/headers ever collected.

## Technical Context

**Language/Version**: TypeScript 5.6, strict mode (`exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`)

**Primary Dependencies**: React 18.3, WXT 0.19, `ai` SDK 5, zod 4; no new dependencies

**Storage**: `chrome.storage.session` for per-tab network/console buffers (SW-restart-safe, never persisted across browser restarts); `diagnosticsConsent` on Conversation in `chrome.storage.local` (mirrors `screenshotConsent`)

**Testing**: Vitest 3 + @testing-library/react (jsdom) for unit/component; Playwright (workers: 1) for e2e; coverage gates ≥80% on `src/agent`, `src/providers`, `src/storage`

**Target Platform**: Manifest V3 Chrome/Brave extension (background SW + content scripts + side panel)

**Project Type**: Browser extension

**Performance Goals**: Tool round-trip < 1 s on typical pages; capture overhead imperceptible (bounded buffers, batched session-storage flushes)

**Constraints**: MV3 event-driven SW (no persistent in-memory state — buffers must live in `chrome.storage.session`); no `chrome.debugger` (banner); no request/response bodies or headers; diagnostics content is untrusted and must reach the model only as data, only after per-conversation consent

**Scale/Scope**: ~10 source files touched, 2 new tools, 1 new content probe, consent flow replicated, ~6 test files updated/added

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle                           | Gate                                                                                                                                                                                  | Status  |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| I. MV3 core architecture            | `webRequest` listeners are event-driven; buffers in `chrome.storage.session` survive SW termination; no new persistent in-worker state                                                | ✅ PASS |
| II. Unified multi-provider layer    | New tools registered in existing `toolDefinitions`/`executeTool`; provider contract unchanged                                                                                         | ✅ PASS |
| III. Local agent / ACP              | Tools re-exposed through the MCP server (`native-host/com.sancho.mcp_server.mjs`); ACP tool invocations route through the same consent-gated `executeTool`                            | ✅ PASS |
| IV. Browser automation & security   | Diagnostics = untrusted page data: truncated, capped, passed as data only; explicit per-conversation opt-in before anything reaches a cloud provider (spec FR-005); no bodies/headers | ✅ PASS |
| V. React UI & state sync            | Consent prompt state flows over the existing bridge (`chat.error` signal + new consent request op); no UI-local persistence                                                           | ✅ PASS |
| VI. Typing, hygiene & quality gates | Zod schemas for new tools; unit/component/e2e tests; coverage gates retained; no dynamic code execution (`postMessage` relay only)                                                    | ✅ PASS |

No violations; Complexity Tracking not required.

## Project Structure

### Documentation (this feature)

```text
specs/009-page-diagnostics-tools/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── diagnostics-tools.md  # Phase 1 output (tool schemas, message protocol, consent flow)
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (repository root)

```text
entrypoints/
├── background.ts            # register webRequest listeners + console-probe registration + diagnostics.consent handler
├── content.ts               # console.read message handler → relay to MAIN probe; buffer fallback
└── diag-probe.ts (new)      # MAIN-world document_start probe: console.*/onerror/unhandledrejection ring buffer + postMessage relay
src/
├── agent/
│   ├── tools.ts             # getConsoleMessages/getNetworkRequests schemas + definitions + execution
│   ├── diagnostics.ts (new) # network ring-buffer recorder (webRequest handlers) + read/reset helpers
│   └── chat-handler.ts      # handleDiagnosticsConsent + consent_required surfacing for diagnostics
├── bridge/
│   └── messages.ts          # diagnostics.consent op + payload type
├── ui/
│   ├── hooks/useSanchoRuntime.ts  # diagnostics consent state + grant action
│   └── components/chat.tsx        # diagnostics consent banner (parallel to screenshot banner)
├── storage/
│   └── conversations.ts     # diagnosticsConsent default false
└── types.ts                 # Conversation.diagnosticsConsent
native-host/
└── com.sancho.mcp_server.mjs  # expose console_messages/network_requests tools to ACP agents
wxt.config.ts                # add "webRequest" permission

tests/
├── unit/
│   ├── tools.test.ts            # sorted tool names + new schemas
│   ├── diagnostics.test.ts (new)# ring buffer cap/truncation/reset
│   ├── agent-glue.test.ts       # consent gating for both tools
│   └── handlers.test.ts         # diagnostics.consent persists
├── component/
│   └── sidepanel.test.tsx       # diagnostics consent banner flow
└── e2e/
    └── page-diagnostics.spec.ts (new)  # end-to-end console/network capture on fixture page
```

**Structure Decision**: Existing single-project extension layout; one new probe entrypoint and one new agent module. Consent flow clones the screenshot pattern file-for-file.

## Design Details

### Console capture (`entrypoints/diag-probe.ts`)

- Registered via `chrome.scripting.registerContentScripts` on SW startup/install: id `sancho-diag-probe`, `world: "MAIN"`, `runAt: "document_start"`, `matches: ["<all_urls>"]`, `allFrames: false`.
- Wraps `console.log/info/warn/error`, captures `window.onerror` and `unhandledrejection` into an in-page ring buffer (`MAX_CONSOLE_ENTRIES = 200`, per-entry text truncated to 500 chars).
- Read protocol: listens for `window.postMessage` `{ source: "sancho-diag", type: "console.read" }`, replies `{ source: "sancho-diag-probe", type: "console.entries", entries }`.
- The isolated content script (`content.ts`) adds a `console.read` handler: relays the read via `postMessage`, awaits the probe reply (with timeout), returns entries; on restricted pages the existing `RestrictedPageError` path yields the FR-008 error.
- Buffers reset naturally on navigation (new page context) — FR-002. Pre-probe-history is unattainable; the tool result includes `capturedFrom: "page-load" | "injection-time"` honesty metadata.

### Network capture (`src/agent/diagnostics.ts`)

- Background listeners: `chrome.webRequest.onCompleted` + `onErrorOccurred` (filter: `urls: ["<all_urls>"]`).
- Each event appends `{ url (≤300 chars), method, status | error, startTime, durationMs }` to a per-tab ring buffer (`MAX_NETWORK_ENTRIES = 100`) stored in `chrome.storage.session` under `diagNet:<tabId>`; writes batched (flush every 25 events or 2 s) to avoid storage churn on noisy pages.
- Buffer cleared when `chrome.tabs.onUpdated` reports a navigation (`status === "loading"` with URL change) — per-page scoping, mirrors console reset.
- `getNetworkRequests` reads the buffer for the conversation's active `tabId` directly in the background (no content round-trip).

### Tool gating

- `executeTool` checks `getActiveConversation().diagnosticsConsent` for both tools; without consent returns `{ ok: false, error: "diagnostics_consent_required" }`.
- `chat-handler.ts` (both local-loop and ACP invoke paths) maps that error to `chat.error { message: "diagnostics_consent_required" }`; UI shows its own banner ("Allow page diagnostics" — separate from the screenshot banner); grant posts `diagnostics.consent { granted: true }`.
- `handleDiagnosticsConsent` persists on the conversation; `chat.clear` resets it automatically since it creates a fresh conversation.

### Out of scope (per spec)

- Response/request bodies and headers (would require `chrome.debugger`).
- iframe/worker console sources.
- A dedicated diagnostics UI panel.
