# Feature Specification: Assistant-UI Primitives Alignment & Settings Polish

**Feature Branch**: `007-assistant-ui-primitives`

**Created**: 2026-09-21

**Status**: Draft

**Input**: User description: "Align the chat side-panel UI with assistant-ui primitives: ChatGPT-style composer with stop control, message action bar (copy, regenerate), accessible error display on failed messages, chain-of-thought display for model reasoning and tool calls, ThreadList-based conversation list, Appearance section in settings with gear button opening the settings page, plus thread polish (scroll-to-bottom, welcome state)."

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Modern composer with run control (Priority: P1)

The user writes messages in a polished, ChatGPT-style composer: a rounded input card that grows with the text, with a compact circular send button. While the agent is working, the send affordance becomes a stop button so the user can cancel the run.

**Why this priority**: The composer is the single most-used surface; it currently looks hand-rolled and offers no way to stop a run despite backend support existing.

**Independent Test**: Type a multi-line message, send it, and stop the agent mid-run; delivers immediate value without any other story.

**Acceptance Scenarios**:

1. **Given** the chat panel is open, **When** the user types and presses Enter, **Then** the message is sent and the composer clears; Shift+Enter inserts a newline.
2. **Given** the composer input, **When** the user types several lines, **Then** the input grows vertically within the rounded container instead of scrolling immediately.
3. **Given** an agent run is in progress, **When** the user clicks the stop button, **Then** the run is cancelled and the composer returns to its idle state.
4. **Given** the composer is empty, **When** no text is present, **Then** the send button is disabled.

---

### User Story 2 - Thought process display (Priority: P1)

While the agent works, the user sees a collapsible "thought process" section inside the assistant message that shows the agent's reasoning (when the model provides it) and each tool invocation with its running/done state — instead of a separate activity strip detached from the message.

**Why this priority**: Understanding what the agent is doing (which tools it used, why) is core to trusting an agent; the current strip loses context and history within the message flow.

**Independent Test**: Send a message that triggers a tool call and verify the tool invocation appears inside a collapsible group in the assistant message.

**Acceptance Scenarios**:

1. **Given** a run that invokes tools, **When** a tool starts and finishes, **Then** the tool entry appears in the assistant message with its name and running/done status.
2. **Given** a model that emits reasoning, **When** reasoning streams in, **Then** it appears in the thought-process group, separate from the final answer text.
3. **Given** a model that emits no reasoning, **When** a run completes, **Then** the group still shows tool calls and the experience degrades gracefully (no empty reasoning block).
4. **Given** a finished message with a thought process, **When** the user collapses/expands the group, **Then** the final answer text remains visible either way.

---

### User Story 3 - Message action bar (Priority: P2)

Each message offers contextual actions underneath it: copy the message content, and (for assistant messages) regenerate the response.

**Why this priority**: Copy is already valued (existing custom button); regenerate closes a common agent-UX gap. Auto-hide keeps the thread clean.

**Independent Test**: Hover a message, copy its content, and regenerate an assistant reply; verifiable without other stories.

**Acceptance Scenarios**:

1. **Given** any message, **When** the user clicks copy, **Then** the message's raw markdown is on the clipboard and the button shows a brief confirmation state.
2. **Given** a completed assistant message, **When** the user clicks regenerate, **Then** the assistant turns after the last user message are discarded and the agent produces a fresh response.
3. **Given** a run is in progress, **When** the user views the action bar, **Then** actions are hidden or disabled so they cannot interrupt the run.
4. **Given** a thread with several messages, **When** the user is not hovering a message, **Then** only the last message shows its action bar.

---

### User Story 4 - Accessible error display (Priority: P2)

When a run fails, the failure is shown as a proper error notice attached to the failed message — announced to assistive technology — instead of being impersonated as assistant chat text.

**Why this priority**: Errors masquerading as assistant content are confusing and can be copied/exported as if the agent said them.

**Independent Test**: Force a provider failure and verify the error appears as a distinct alert on the message, not as chat content.

**Acceptance Scenarios**:

1. **Given** a run that fails, **When** the error arrives, **Then** the failed message shows an error-styled notice with the failure reason.
2. **Given** the error notice, **When** rendered, **Then** it uses an alert role so screen readers announce it.
3. **Given** the consent-required condition, **When** it occurs, **Then** the existing consent banner still appears instead of an error notice.

---

### User Story 5 - Conversation list via standard thread list (Priority: P2)

The user manages conversations (list, create, switch, delete) through a standard thread-list interface with an active-conversation indicator, replacing the hand-rolled list.

**Why this priority**: Equivalent functionality exists today; this standardizes behavior (keyboard navigation, active state) and reduces custom code.

**Independent Test**: Open the list, create/switch/delete a conversation; the rest of the chat is untouched.

**Acceptance Scenarios**:

1. **Given** saved conversations, **When** the user opens the list, **Then** all conversations are shown with the active one visually marked.
2. **Given** the list, **When** the user selects another conversation, **Then** the chat shows that conversation.
3. **Given** the list, **When** the user deletes a conversation, **Then** it disappears and, if it was active, the chat moves to a fresh conversation.
4. **Given** the list, **When** the user creates a new conversation, **Then** the chat switches to it.

---

### User Story 6 - Settings access & appearance section (Priority: P3)

The settings page gains a dedicated Appearance section (containing the message font-size choice) reachable from the page's navigation. From the chat panel, the gear button opens the full settings page; a separate quick control still opens the lightweight in-panel appearance view.

**Why this priority**: Discoverability — today the settings page is only reachable through Chrome's "manage extension" UI.

**Independent Test**: Click the gear in the chat panel top bar and confirm the settings page opens with an Appearance section in its navigation.

**Acceptance Scenarios**:

1. **Given** the chat panel, **When** the user clicks the gear icon, **Then** the extension settings page opens.
2. **Given** the settings page, **When** the user opens the Appearance section via the page navigation, **Then** the font-size setting is there (and not duplicated elsewhere).
3. **Given** the chat panel, **When** the user opens the quick appearance view and changes font size, **Then** the change applies to the chat immediately and persists.

---

### User Story 7 - Thread polish (Priority: P3)

When a conversation grows beyond the viewport, a floating scroll-to-bottom button appears while scrolled up, and a welcoming empty state is shown for new conversations.

**Why this priority**: Quality-of-life polish; lowest risk, lowest urgency.

**Independent Test**: Scroll up in a long conversation and use the button to return to the latest message.

**Acceptance Scenarios**:

1. **Given** a long conversation scrolled away from the bottom, **When** the user clicks the scroll-to-bottom button, **Then** the view jumps to the newest content.
2. **Given** a new empty conversation, **When** the chat is shown, **Then** a friendly welcome/empty state appears instead of a blank area.

---

### Edge Cases

- Regenerate clicked while a run is in progress: the action is unavailable during runs.
- Regenerate on a conversation whose last message is from the user (no assistant reply yet): behaves as a normal resend.
- Error arrives before any assistant content exists for the run: the error notice attaches to the placeholder assistant message.
- A tool call is interrupted mid-run (stop or failure): its entry shows a terminal (not perpetually "running") state.
- The model emits reasoning for only part of a run: the thought-process group renders whatever reasoning and tool entries exist.
- Conversation list is empty: the list shows only the create action and the chat remains usable.
- Thought-process groups are not restored after reload or conversation switch (history stores final message content only); the message still shows its text and actions.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: The composer MUST be presented as a rounded input card with an auto-growing text area and a compact primary send button; Enter sends, Shift+Enter inserts a newline, and send is disabled while empty.
- **FR-002**: While an agent run is in progress, the composer MUST offer a stop action that cancels the run.
- **FR-003**: Assistant messages MUST render model reasoning (when the model provides any) and tool invocations (name plus running/done state) inside a collapsible thought-process group within the message, ordered before the final answer text.
- **FR-004**: The detached tool-activity strip MUST be removed once tool invocations are shown within messages.
- **FR-005**: Messages MUST expose an action bar with copy; assistant messages MUST additionally offer regenerate. The bar MUST be hidden or disabled during an active run and auto-hide on non-last messages until hover.
- **FR-006**: Regenerate MUST discard the assistant output produced after the most recent user message and produce a fresh response for that user message.
- **FR-007**: Copy MUST place the message's raw markdown on the clipboard and show transient confirmation feedback.
- **FR-008**: Run failures MUST be displayed as an error notice attached to the failed message with an accessible alert role, and MUST NOT be injected as assistant-authored chat content.
- **FR-009**: The screenshot-consent flow MUST continue to use its existing banner and MUST NOT be rendered as a generic error notice.
- **FR-010**: Conversation management (list, create, switch, delete) MUST use the chat library's standard thread-list interface, with the active conversation visually marked.
- **FR-011**: The settings page MUST present Appearance as a top-level section in its navigation, containing the message font-size setting.
- **FR-012**: The chat panel's gear button MUST open the extension settings page; a separate quick control MUST open the lightweight in-panel appearance view.
- **FR-013**: Font-size changes from either surface MUST apply immediately and persist across sessions.
- **FR-014**: Long conversations MUST offer a floating scroll-to-bottom affordance when scrolled away from the latest content, and empty conversations MUST show a welcome state.

### Key Entities _(include if feature involves data)_

- **Message**: extends the existing chat message concept — in addition to role and final content, a live assistant message may carry reasoning entries, tool invocations, and a failure status during the session.
- **Thought process**: the ordered collection of reasoning entries and tool invocations produced during a run; session-scoped (not persisted with conversation history).
- **Appearance preferences**: the existing persisted UI preferences (font size), unchanged in shape.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Users can cancel 100% of in-progress runs from the composer in one click, and the cancellation takes visible effect within 1 second.
- **SC-002**: Users can copy any message and regenerate any completed assistant reply without leaving the thread, each in at most 2 clicks.
- **SC-003**: Every run failure is surfaced as a distinct, screen-reader-announced error notice; 0 failures are rendered as assistant-authored content.
- **SC-004**: Users reach the full settings page from the chat panel in 1 click (previously only via the browser's extension-management UI).
- **SC-005**: All existing chat behaviors (streaming, markdown rendering, conversation switching, consent flows) pass the existing automated end-to-end suite unchanged after the refactor.

## Assumptions

- The chat UI library is upgraded to its current 0.15.x line (with its markdown and syntax-highlighter companions); React 18 remains supported, so no framework upgrade is needed. An icon library (lucide-react) is added for standard action glyphs.
- The library's legacy chain-of-thought accordion is avoided; thought-process grouping uses the library's current grouped-parts capability with a custom collapsible presentation.
- Reasoning availability depends on the connected model/provider; when absent, the thought-process group shows tool activity only.
- Tool invocations and reasoning are displayed live during the session but are **not** persisted into saved conversation history; after reload or conversation switch, messages show their final content and actions only.
- Regenerate is defined as "discard assistant turns after the last user message and re-run"; message editing and feedback actions are out of scope.
- Archive/rename of conversations remain unsupported; the thread list exposes only list/create/switch/delete.
- Appearance scope is limited to the existing font-size preference; themes are out of scope.
