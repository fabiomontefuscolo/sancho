# Research: Page Diagnostics Tools

**Date**: 2026-09-22 | **Feature**: [spec.md](spec.md)

## R1. Console capture mechanism

**Decision**: A MAIN-world probe injected at `document_start` via `chrome.scripting.registerContentScripts` (`world: "MAIN"`), holding the ring buffer in-page; the isolated content script relays read requests via `window.postMessage`.

**Rationale**: The page's `console` object and error events live in the MAIN world — isolated content scripts cannot observe them. `document_start` registration is required for load-time errors (spec FR-002). MAIN-world scripts have no extension messaging APIs, so `postMessage` relay through the existing isolated content script is the only bridge. Keeping the buffer in-page makes navigation reset automatic (new document = new probe = empty buffer).

**Alternatives considered**:

- `chrome.debugger` CDP (`Runtime.consoleAPICalled`): full fidelity including pre-attach history — rejected (persistent "debugging this browser" banner, high store scrutiny; spec excludes it).
- Isolated-world console wrapping: rejected (sees a different `console` global than the page).
- Static manifest content script instead of dynamic registration: viable, but dynamic registration keeps everything code-managed alongside `ensureContentScript`'s runtime-injection model.

**Caveats accepted**: pages already loaded before extension install/update get the probe only on next navigation; `postMessage` is page-spoofable, but diagnostics data is untrusted by design (spec FR-007) so spoofing adds no new risk class; a `source: "sancho-diag"` marker plus `event.source === window` check filters casual noise.

## R2. Network capture mechanism

**Decision**: `chrome.webRequest.onCompleted` + `onErrorOccurred` in the background SW, writing per-tab ring buffers to `chrome.storage.session` (batched flushes).

**Rationale**: Only `webRequest` provides reliable HTTP status codes and network-level failure reasons in MV3. In-memory buffers would violate MV3's ephemeral-SW constraint (constitution I) — the SW can be killed after 30 s idle, losing history; `chrome.storage.session` survives SW restarts but not browser restarts, matching spec FR-009. Batched flush (every 25 events or 2 s) bounds storage churn on request-heavy pages.

**Alternatives considered**:

- `PerformanceResourceTiming` via the probe: no permission needed, but `responseStatus` is unreliable cross-origin (0 without Timing-Allow-Origin) and network-level failures (DNS, blocked) never produce entries — rejected, status accuracy is the feature's core (SC-002).
- `chrome.debugger` Network domain: bodies/headers available — rejected (banner, scope exclusion).
- `declarativeNetRequest`: rule-based blocking/matching, not observation — wrong tool.

## R3. Consent design

**Decision**: New per-conversation `diagnosticsConsent` boolean cloning the `screenshotConsent` flow end-to-end, with a distinct consent signal (`diagnostics_consent_required`) and a separate UI banner.

**Rationale**: Spec FR-005 mandates the existing pattern; a separate flag lets users grant screenshots without diagnostics and vice versa. Collection stays on-device until consent; only the tool-result path (which feeds the model) is gated — constitution IV compliant.

**Alternatives considered**: sharing one consent flag for both features — rejected (overbroad grant; the two data classes have different sensitivity).

## R4. Buffer caps and truncation

**Decision**: Console: 200 entries/tab, 500 chars/entry. Network: 100 entries/tab, 300 chars/URL. Tool default returns the 50 most recent entries; `truncated: true` signals overflow (mirrors `snapshot.ts`'s `maxElements` + `truncated` pattern).

**Rationale**: Mirrors the existing context-protection discipline (`MAX_CHUNK_CHARS`, `MAX_TOTAL_CHARS = 32_000`); worst-case payload ≈ 200×500 = 100 KB stays inside the buffer, while the default 50-entry read ≈ 25 KB worst case, typically far less — bounded and comparable to a `read_page` result.

## R5. Tool surface

**Decision**: `getConsoleMessages({ limit?, level? })` and `getNetworkRequests({ limit? })`, both consent-gated, returning `{ ok, entries|requests, truncated }` or `{ ok: false, error }`. Also registered in the MCP server so ACP agents get parity.

**Rationale**: Follows the existing zod-schema + `toolDefinitions` registry; filters keep the agent's self-service retrieval flexible without pagination complexity. ACP parity is free since tool invocations already route through the consent-gated `executeTool`.

## R6. Content-script read protocol

**Decision**: New message type `console.read` in `content.ts`'s `handleMessage` switch; it relays to the probe and times out after 2 s returning `{ ok: true, entries: [], note: "probe unavailable" }` when the probe is absent (e.g., page loaded before install).

**Rationale**: Reuses the proven `sendToContent` plumbing (incl. `RestrictedPageError` → FR-008 error). A graceful empty result beats an opaque failure on probe-less pages — the agent can state the limitation.
