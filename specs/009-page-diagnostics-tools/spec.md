# Feature Specification: Page Diagnostics Tools

**Feature Branch**: `009-page-diagnostics-tools`

**Created**: 2026-09-22

**Status**: Draft

**Input**: User description: "Allow the agent to check the active page's console/error messages and network requests (metadata only, no bodies) as agent tools, using MV3-compatible mechanisms (webRequest for network metadata, in-page console/error capture), gated by the same opt-in consent discipline as screenshots."

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Agent inspects console errors on the active page (Priority: P1)

A user troubleshooting a web page asks the agent "why is this page broken?" or "are there any console errors?". After granting diagnostics access for the conversation, the agent retrieves the page's recent console messages and JavaScript errors (console.log/warn/error output, uncaught exceptions, unhandled promise rejections) and explains what it finds — e.g., "There's a TypeError in checkout.js line 42 and a failed CSP report."

**Why this priority**: Console errors are the most common and highest-signal diagnostic source for "page is broken" questions; this is the core value of the feature.

**Independent Test**: On a page that logs a known error, grant consent, ask the agent "check the console errors", and verify the agent's reply names the error. Delivers standalone value without the network tool.

**Acceptance Scenarios**:

1. **Given** a page with recent console errors and diagnostics consent granted, **When** the user asks the agent to check console errors, **Then** the agent's reply reflects the actual messages (level and text).
2. **Given** diagnostics consent has NOT been granted, **When** the agent attempts to read console messages, **Then** the user is first asked for consent, and no console data reaches the model before consent is granted.
3. **Given** consent granted and a page with no console activity, **When** the agent checks the console, **Then** it reports that the console is clean rather than fabricating messages.

---

### User Story 2 - Agent inspects network request outcomes (Priority: P2)

A user asks "did the save request succeed?" or "is the page failing to load something?". With consent granted, the agent lists recent network activity for the tab — URL, method, outcome (status code or failure reason), and timing — and identifies failures, e.g. "POST /api/save returned 500" or "the fonts request was blocked."

**Why this priority**: Network outcomes complement console errors for diagnosis, but are the second-most-useful signal; the feature is valuable with console alone.

**Independent Test**: On a page that makes a request failing with a 4xx/5xx status (or a network error), grant consent, ask the agent about the failing request, and verify the reply names the URL and outcome.

**Acceptance Scenarios**:

1. **Given** consent granted and a tab with completed requests, **When** the user asks about network activity, **Then** the agent reports URLs, methods, and outcomes for recent requests.
2. **Given** a request that failed (HTTP error status or network-level failure), **When** the agent inspects network activity, **Then** the failure and its reason are identifiable in the agent's answer.
3. **Given** any request, **When** the agent reports on it, **Then** no request or response bodies are ever included — only metadata.

---

### User Story 3 - Consent and data discipline (Priority: P2)

A privacy-conscious user wants assurance that page diagnostics don't silently leak to the cloud. Diagnostics data is only collected from the page/tab when needed for a request, only reaches the model after the user explicitly grants diagnostics consent for the conversation, is clearly size-capped, and never persists beyond the conversation.

**Why this priority**: Equal in importance to US2 — the feature touches sensitive page data, so the consent contract is a first-class deliverable, consistent with the extension's existing screenshot-consent behavior.

**Independent Test**: Revoke/never-grant consent, trigger the agent to attempt diagnostics, and verify (a) the consent prompt appears, (b) declining leaves the agent without diagnostics data, (c) no diagnostics content appears in any model request.

**Acceptance Scenarios**:

1. **Given** a new conversation, **When** the agent first attempts to use a diagnostics tool, **Then** the user sees a consent prompt explaining what data will be shared.
2. **Given** the user declines, **When** the agent proceeds, **Then** it answers without diagnostics data and does not retry covertly.
3. **Given** consent was granted in a conversation, **When** a new conversation starts, **Then** consent must be granted again.

---

### Edge Cases

- **Very noisy pages**: console output and request volume are capped (e.g., most recent ~200 console entries, most recent ~100 requests) and individual messages truncated, so the model context cannot explode.
- **Sensitive data in URLs/messages**: diagnostics content is treated as untrusted page data; it is truncated and passed as data, and the user is warned in the consent prompt that URLs and messages may contain sensitive information.
- **Restricted pages** (chrome://, Web Store, etc.): diagnostics tools report a clear "unavailable on this page" outcome instead of failing opaquely.
- **Errors that occurred before the extension could observe**: console capture begins at page load (via early injection) or from tool-enable time onward; the agent can observe capture-start limitations rather than claiming complete history.
- **Navigation**: console buffer resets (or is scoped) on navigation so the agent never confuses errors from a previous page with the current one.
- **Cross-tab isolation**: diagnostics always target the conversation's active tab, never a background tab.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: The agent MUST be able to retrieve recent console messages (level, text, timestamp) from the conversation's active tab, including console.log/info/warn/error output, uncaught exceptions, and unhandled promise rejections.
- **FR-002**: Console capture MUST begin as early as possible during page load so that load-time errors are visible, and MUST be scoped so navigation does not leak one page's messages into another page's results.
- **FR-003**: The agent MUST be able to retrieve recent network request metadata for the conversation's active tab: URL, HTTP method, outcome (status code or failure reason), and timing.
- **FR-004**: Network diagnostics MUST NOT include request bodies, response bodies, or header values.
- **FR-005**: Both diagnostics tools MUST be gated behind an explicit per-conversation user consent, following the extension's existing screenshot-consent pattern: the first tool attempt in a conversation prompts the user; declining denies access for that conversation; consent does not carry over to new conversations.
- **FR-006**: Diagnostics content MUST be size-capped before reaching the model: bounded entry counts (most recent entries win), truncated individual messages/URLs, following the same context-protection discipline as page-content reading.
- **FR-007**: Diagnostics content MUST be treated as untrusted page data (it may contain injection attempts); it MUST be passed to the model as data, never as instructions.
- **FR-008**: On pages where observation is impossible (restricted pages), the tools MUST return a clear, user-comprehensible unavailability outcome.
- **FR-009**: Diagnostics data MUST NOT be persisted to conversation history beyond the normal tool-result message flow, and MUST NOT be retained across browser restarts.
- **FR-010**: Diagnostics MUST target only the conversation's active tab.

### Key Entities

- **Console Entry**: level (log/info/warn/error/exception), text (truncated), timestamp. Bounded buffer per tab/page load.
- **Network Request Record**: URL (truncated), method, outcome (status or failure reason), start/duration timing, tab association. Bounded buffer per tab.
- **Diagnostics Consent**: per-conversation boolean, same lifecycle as the existing screenshot consent.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Given a page with a known console error, the agent correctly names that error in its reply in at least 9 out of 10 attempts.
- **SC-002**: Given a failing request, the agent identifies the failing URL and its outcome in at least 9 out of 10 attempts.
- **SC-003**: 100% of diagnostics tool uses in a fresh conversation are preceded by a visible consent prompt; 0% of model requests contain diagnostics data when consent was declined or not yet given.
- **SC-004**: Diagnostics payloads reaching the model never exceed their configured caps (entry count and per-entry length) in 100% of cases, including pages generating thousands of console messages or requests.
- **SC-005**: 0% of diagnostics results include request/response bodies or header values.
- **SC-006**: Users can complete the full diagnose-a-broken-page flow (ask → consent → answer) in under 1 minute.

## Assumptions

- Consent reuses the existing per-conversation screenshot-consent pattern (prompt in the chat UI, stored on the conversation, not persisted across conversations) — a reasonable default consistent with the constitution's privacy-by-default principle; a separate consent flag (not shared with screenshots) is assumed so users can grant one without the other.
- Agent-facing tools only: no dedicated diagnostics panel in the UI beyond the consent prompt; results surface through the agent's normal replies and tool-call display.
- Network metadata observation requires declaring an additional browser permission; console capture requires no new permissions (in-page observation at document start).
- Buffer sizes (200 console entries, 100 requests) and per-entry truncation are initial defaults and may be tuned during implementation.
- Full-fidelity capture (response bodies, headers, or pre-navigation history) is out of scope, as it would require the debugger permission and its persistent warning banner.
- Console capture covers the page's main execution context; messages from iframes, workers, or browser-internal sources are out of scope.
