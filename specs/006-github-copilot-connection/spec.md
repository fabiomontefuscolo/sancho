# Feature Specification: GitHub Copilot Connection Method

**Feature Branch**: `006-github-copilot-connection`
**Created**: 2026-09-21
**Status**: Draft
**Input**: User description: "Add GitHub Copilot as a third connection method: OAuth device flow auth (no credentials typed), Copilot token exchange with auto-refresh, OpenAI-compatible chat endpoint with Copilot headers, model list fetched from /models, settings UI with Connect/Disconnect and disclaimer."

## User Scenarios & Testing _(mandatory)_

### User Story 1 - User connects with GitHub without typing credentials (Priority: P1)

The user opens Settings, picks the new "GitHub Copilot" connection method, and clicks "Connect with GitHub". The extension shows a short verification code and opens github.com/login/device. Since the user is already logged into GitHub in the browser, they only confirm the code — no username, password, or API key is ever typed. Once confirmed, the extension completes the device flow and stores the resulting GitHub token locally.

**Why this priority**: The entire value of this feature is a credentials-free setup; without it the connection method does not exist.

**Independent Test**: With an empty local token store, the user starts the flow from Settings, sees a code, authorizes on GitHub's page, and the settings panel flips to "connected" — all without typing any credential into the extension.

**Acceptance Scenarios**:

1. **Given** the copilot method selected and no stored token, **When** the user clicks "Connect with GitHub", **Then** a verification code and the github.com/login/device link are displayed and the authorization page opens in a new tab.
2. **Given** the flow is pending, **When** the user authorizes on GitHub, **Then** the extension detects authorization within one polling interval and shows a connected state.
3. **Given** the flow is pending, **When** the user cancels/denies on GitHub or the code expires (15 min), **Then** the UI returns to the disconnected state with a clear message, and no partial token is kept.
4. **Given** a stored token from a previous session, **When** the options page loads, **Then** the panel shows "connected" immediately without re-authenticating.

---

### User Story 2 - User chats through Copilot with transparent token refresh (Priority: P1)

With a connected account and a chosen model, the user chats as with any other method. The extension exchanges the GitHub token for a short-lived Copilot session token (~30 min), uses the OpenAI-compatible Copilot chat endpoint, and refreshes the session token automatically when it expires — the user never sees re-authentication prompts during normal use.

**Why this priority**: Chat must "just work" after connecting; manual token management would defeat the feature.

**Independent Test**: After connecting and picking a model, the user sends a chat message and receives a streamed answer; with a stubbed/expired session token, the next send transparently fetches a fresh one and succeeds.

**Acceptance Scenarios**:

1. **Given** a connected account and selected model, **When** the user sends a message, **Then** the request goes to the Copilot chat endpoint with the session token and the Copilot-specific headers, and the reply streams into the chat.
2. **Given** a cached session token that is expired or about to expire, **When** the next chat send happens, **Then** a fresh session token is fetched first and the send succeeds without user interaction.
3. **Given** the GitHub token is rejected (revoked on GitHub or no Copilot subscription), **When** a send or refresh is attempted, **Then** the user gets a clear error telling them to reconnect, and the settings panel offers the connect flow again.
4. **Given** the copilot method is active, **When** the user runs a context-menu action (Explain/Summarize), **Then** it also works through the same connection.

---

### User Story 3 - User picks from their available Copilot models (Priority: P2)

After connecting, the settings panel fetches the list of models available to the user's Copilot subscription and offers them in a dropdown; the user picks one and saves.

**Why this priority**: Model availability varies by subscription; a live list prevents typos and invalid models, but a manual fallback keeps the feature usable.

**Independent Test**: After connecting, the model dropdown lists the models returned by the models endpoint; if the fetch fails, a free-text field is offered instead.

**Acceptance Scenarios**:

1. **Given** a connected account, **When** the settings panel loads the copilot section, **Then** the model picker is populated from the live models list.
2. **Given** the models fetch fails (network or auth), **When** the panel renders, **Then** the user can still type a model name manually.
3. **Given** a saved copilot configuration, **When** the panel reopens, **Then** the previously selected model is preselected.

---

### User Story 4 - User understands the nature of the integration and can disconnect (Priority: P3)

The copilot section shows a short inline note explaining that a Copilot subscription is required and that this uses an undocumented API at the user's own risk. A "Disconnect" button removes the stored tokens and returns the panel to the disconnected state.

**Why this priority**: Transparency and an escape hatch; not required for the core flow.

**Independent Test**: The note is visible in the copilot settings section; clicking Disconnect clears the stored auth and the panel shows the connect button again.

**Acceptance Scenarios**:

1. **Given** the copilot method is selected, **When** the section renders, **Then** the subscription/undocumented-API note is visible in both connected and disconnected states.
2. **Given** a connected account, **When** the user clicks Disconnect, **Then** the stored GitHub and session tokens are removed and subsequent chat sends report "not configured" until reconnected.

---

### Edge Cases

- Options page closed mid-flow: polling stops; the pending code simply expires (no dangling state).
- Service worker restart during polling: flow is resumable only via a new code; the UI returns to disconnected state on next status check.
- Device-flow polling faster than the allowed interval: the poller respects `slow_down` responses by increasing the interval.
- GitHub Enterprise/business Copilot with custom API routing: out of scope (individual accounts only).
- Models list changes after connecting: the dropdown refetches on each options-page load; a stale saved model name is still sent as-is.
- Copilot session token expiring mid-stream: the stream fails with an error surfaced in chat; the next send refreshes and succeeds.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: The user MUST be able to start a GitHub OAuth device authorization flow from Settings without typing any credential into the extension; the UI MUST display the user verification code and open the GitHub device authorization page.
- **FR-002**: The extension MUST poll GitHub for authorization completion, honoring the requested polling interval and `slow_down` back-off, and MUST handle denial, expiration, and network errors with clear UI states.
- **FR-003**: The resulting GitHub token MUST be stored locally (`chrome.storage.local`), never synced, and reused across sessions until revoked or disconnected.
- **FR-004**: Before each chat send, the extension MUST exchange the GitHub token for a Copilot session token when none is cached or the cached one is expired/expiring, without any user interaction.
- **FR-005**: Chat and context-menu actions with the copilot method MUST use the Copilot OpenAI-compatible chat endpoint with the required Copilot-specific request headers.
- **FR-006**: Token rejection (revoked token or missing Copilot subscription) MUST surface a clear error in chat and guide the user to reconnect.
- **FR-007**: After connecting, the settings panel MUST fetch the available model list and offer it as a picker, with a free-text fallback when the fetch fails.
- **FR-008**: The copilot settings section MUST display an inline note that a Copilot subscription is required and that the API is undocumented and used at the user's own risk.
- **FR-009**: The user MUST be able to disconnect, which removes all stored Copilot auth data.
- **FR-010**: The new method MUST NOT change behavior of the existing "api" and "acp" connection methods.

### Key Entities _(include if feature involves data)_

- **CopilotAuth**: locally stored auth state — GitHub token, cached session token, session-token expiry timestamp.
- **ProviderConfig (extended)**: the existing connection configuration gains a third method value; for copilot it carries a fixed endpoint, a chosen model, and no user-managed API key.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: A user already logged into GitHub completes the connection setup without typing any credential into the extension (only a code confirmation on GitHub's own page).
- **SC-002**: After connecting, 100% of chat sends use a valid session token, with refresh happening transparently (zero re-authentication prompts) as long as the GitHub token stays valid.
- **SC-003**: Unit tests cover the device-flow polling logic, session-token cache/refresh, provider construction, and header injection; the settings panel copilot section has component tests for disconnected, pending, and connected states.
- **SC-004**: Existing tests for "api" and "acp" methods pass unchanged (no regression).

## Assumptions

- The user has a GitHub account with an active Copilot subscription (individual plan).
- The public Copilot OAuth client ID used by the editor-plugin ecosystem (device flow enabled) remains usable; it is a constant in the codebase, not user-configurable.
- The Copilot chat endpoint is OpenAI-compatible, so the existing OpenAI-compatible provider plumbing is reused with extra headers.
- Interactive, user-driven chat volume is assumed; bulk/automated request patterns are out of scope.
- GitHub Enterprise/business account routing (custom API hosts) is out of scope.
